"""Turn a provider's inbound-webhook payload into one plain email dict, then
read payment notifications out of it.

Providers: Postmark (JSON), CloudMailin (JSON or its default multipart form), Mailgun (form), SendGrid
Inbound Parse (form). Attachments are ignored.
"""
import json
import re
from decimal import Decimal, InvalidOperation
from email.utils import getaddresses, parseaddr, parsedate_to_datetime
from html.parser import HTMLParser

TEXT_LIMIT = 50_000


class _Text(HTMLParser):
    SKIP = {"script", "style", "head", "title"}
    BLOCK = {"p", "div", "br", "tr", "li", "h1", "h2", "h3", "h4", "table", "td"}

    def __init__(self):
        super().__init__()
        self.out, self.skip = [], 0

    def handle_starttag(self, tag, attrs):
        if tag in self.SKIP:
            self.skip += 1
        elif tag in self.BLOCK:
            self.out.append("\n")

    def handle_endtag(self, tag):
        if tag in self.SKIP and self.skip:
            self.skip -= 1

    def handle_data(self, data):
        if not self.skip:
            self.out.append(data)


def html_to_text(html):
    p = _Text()
    try:
        p.feed(html or "")
    except Exception:
        return ""
    text = "".join(p.out)
    return re.sub(r"\n\s*\n+", "\n\n", re.sub(r"[ \t\xa0]+", " ", text)).strip()


_WROTE = re.compile(r"^On .{3,140}?(?P<who>[^<>\n]*)<(?P<addr>[^<>\s]+@[^<>\s]+)>\s*wrote:\s*$", re.M)
_FWD = re.compile(r"^-{3,}\s*Forwarded message\s*-{3,}\s*\n(?:[^\n]*\n){0,3}?From:\s*(?P<who>[^<\n]*)<(?P<addr>[^<>\s]+@[^<>\s]+)>", re.M | re.I)


def tidy(mail):
    """Make a hand-forwarded email readable. Gmail's auto-forward keeps the original untouched, but a manual
    forward arrives quoted ("> …" under "On … <sender> wrote:", or a "Forwarded message" block), sent by the
    forwarder, full of tracking links, "[image: …]" and *markdown*. Undo that, and take the original sender from
    the quote — only when it names a payment app, and it never makes the email count as verified."""
    mail = dict(mail)
    text = mail.get("text") or ""
    lines = text.splitlines()
    nonblank = [l for l in lines if l.strip()]
    if nonblank and sum(1 for l in nonblank if l.lstrip().startswith(">")) * 2 >= len(nonblank):
        text = "\n".join(re.sub(r"^(?:\s*>)+ ?", "", l) for l in lines)
    orig = _WROTE.search(mail.get("text") or "") or _FWD.search(text)
    if orig:
        addr = orig.group("addr").strip().lower()
        dom = addr.rsplit("@", 1)[-1]
        sent_by_app = any(dom == d or dom.endswith("." + d) for ds in APP_DOMAINS.values() for d in ds)
        cur = (mail.get("from_email") or "").rsplit("@", 1)[-1].lower()
        already_app = any(cur == d or cur.endswith("." + d) for ds in APP_DOMAINS.values() for d in ds)
        if sent_by_app and not already_app:
            mail["from_email"], mail["from_name"] = addr, (orig.group("who") or "").strip(" \"'")
    text = re.sub(r"<https?://[^>\s]+>", " ", text)          # <tracking links>
    text = re.sub(r"https?://\S{60,}", " ", text)             # very long bare links
    text = re.sub(r"\[image:[^\]]*\]?", " ", text)           # [image: Chime]
    text = re.sub(r"\*+", "", text)                           # *bold*
    mail["text"] = re.sub(r"\n{3,}", "\n\n", text).strip()
    return mail


def _date(v):
    try:
        return parsedate_to_datetime(v) if v else None
    except (TypeError, ValueError):
        return None


def normalize(content_type, body, form):
    """→ {provider, from_email, from_name, to, subject, text, message_id, headers, sent_at}"""
    data = None
    if "json" in (content_type or ""):
        try:
            data = json.loads(body or b"{}")
        except ValueError:
            data = {}
    if isinstance(data, dict) and ("TextBody" in data or "FromFull" in data):  # Postmark
        hdrs = "\n".join(f"{h.get('Name')}: {h.get('Value')}" for h in data.get("Headers") or [])
        frm = data.get("FromFull") or {}
        return dict(provider="postmark", from_email=frm.get("Email") or parseaddr(data.get("From", ""))[1],
                    from_name=frm.get("Name") or parseaddr(data.get("From", ""))[0], to=data.get("To", ""),
                    subject=data.get("Subject", ""), text=data.get("TextBody") or html_to_text(data.get("HtmlBody")),
                    message_id=data.get("MessageID", ""), headers=hdrs, sent_at=_date(data.get("Date")))
    if isinstance(data, dict) and "envelope" in data and "headers" in data:  # CloudMailin JSON
        h = data.get("headers") or {}
        get = lambda k: h.get(k) or h.get(k.lower()) or ""
        name, addr = parseaddr(get("From"))
        hdrs = "\n".join(f"{k}: {v if isinstance(v, str) else ' '.join(map(str, v))}" for k, v in h.items())
        return dict(provider="cloudmailin", from_email=addr, from_name=name, to=get("To"), subject=get("Subject"),
                    text=data.get("plain") or html_to_text(data.get("html")), message_id=get("Message-ID"),
                    headers=hdrs, sent_at=_date(get("Date")))
    f = form or {}
    if any(k.startswith(("headers[", "envelope[")) for k in f):  # CloudMailin "Multipart Normalized" (its default)
        hv = lambda k: f.get(f"headers[{k}]") or f.get(f"headers[{k.lower()}]") or ""
        name, addr = parseaddr(hv("from") or f.get("envelope[from]", ""))
        hdrs = "\n".join(f"{k[len('headers['):-1]}: {v}" for k, v in f.items() if k.startswith("headers["))
        return dict(provider="cloudmailin", from_email=addr, from_name=name, to=hv("to") or f.get("envelope[to]", ""),
                    subject=hv("subject"), text=f.get("plain") or html_to_text(f.get("html")),
                    message_id=hv("message_id") or hv("message-id"), headers=hdrs, sent_at=_date(hv("date")))
    if "body-plain" in f or "stripped-text" in f:  # Mailgun
        name, addr = parseaddr(f.get("from") or f.get("From") or f.get("sender", ""))
        try:
            hdrs = "\n".join(f"{k}: {v}" for k, v in json.loads(f.get("message-headers") or "[]"))
        except ValueError:
            hdrs = ""
        return dict(provider="mailgun", from_email=addr, from_name=name, to=f.get("To") or f.get("recipient", ""),
                    subject=f.get("subject") or f.get("Subject", ""),
                    text=f.get("body-plain") or html_to_text(f.get("body-html")), message_id=f.get("Message-Id", ""),
                    headers=hdrs, sent_at=_date(f.get("Date")))
    if "envelope" in f or "headers" in f or "text" in f:  # SendGrid Inbound Parse
        name, addr = parseaddr(f.get("from", ""))
        hdrs = f.get("headers", "")
        mid = re.search(r"^Message-ID:\s*(.+)$", hdrs, re.I | re.M)
        return dict(provider="sendgrid", from_email=addr, from_name=name, to=f.get("to", ""), subject=f.get("subject", ""),
                    text=f.get("text") or html_to_text(f.get("html")), message_id=mid.group(1).strip() if mid else "",
                    headers=hdrs, sent_at=None)
    return None


# ------------------------------------------------------------ payments

APP_DOMAINS = {
    "cashapp": ("cash.app", "square.com", "squareup.com"),
    "chime": ("chime.com",),
    "venmo": ("venmo.com",),
    "paypal": ("paypal.com",),
    "zelle": ("zellepay.com",),
}
AMT = r"\$\s?(?P<amt>\d{1,3}(?:,\d{3})+(?:\.\d{2})?|\d+(?:\.\d{2})?)"
NAME = r"(?P<name>[A-Za-z][A-Za-z.'\-]*(?: [A-Za-z][A-Za-z.'\-]*){0,3})"
PATTERNS = [
    re.compile(NAME + r" (?:sent you|paid you|has sent you) " + AMT, re.I),
    re.compile(r"(?:you(?:'ve| just)? received|you just got|you got|received) " + AMT + r"(?: USD)?(?: \w+)? from " + NAME, re.I),
    re.compile(r"(?:payment|money) (?:of |for )?" + AMT + r"(?: USD)? (?:received )?from " + NAME, re.I),
]
NOT_NAMES = {"you", "someone", "a friend", "your", "we"}
NOTE = re.compile(r"(?:\bfor|\bnote|\bmemo|\bmessage)\s*[:\-]?\s*[\"“']([^\"”'\n]{1,80})[\"”']", re.I)


def app_of(from_email, subject, text):
    dom = (from_email or "").rsplit("@", 1)[-1].lower()
    for app, doms in APP_DOMAINS.items():
        if any(dom == d or dom.endswith("." + d) for d in doms):
            return app
    blob = f"{subject} {text[:600]}".lower()
    for app, words in (("zelle", ("zelle",)), ("cashapp", ("cash app", "cashapp")), ("chime", ("chime",)),
                       ("venmo", ("venmo",)), ("paypal", ("paypal",))):
        if any(w in blob for w in words):
            return app
    return ""


def verified_sender(app, from_email, headers):
    """True when an Authentication-Results header (Gmail's survives forwarding as ARC) says DKIM passed
    for the app's own domain, and the From address is that domain."""
    doms = APP_DOMAINS.get(app) or ()
    dom = (from_email or "").rsplit("@", 1)[-1].lower()
    if not doms or not any(dom == d or dom.endswith("." + d) for d in doms):
        return False
    for line in re.findall(r"^(?:ARC-)?Authentication-Results:.*(?:\n[ \t].*)*", headers or "", re.I | re.M):
        for d in doms:
            if re.search(rf"dkim=pass[^;]*header\.(?:i|d)=@?(?:[\w-]+\.)*{re.escape(d)}\b", line, re.I):
                return True
    return False


def read_payment(subject, text):
    """→ (amount, payer, note) or None."""
    blob = re.sub(r"\s+", " ", f"{subject}. {text[:3000]}")
    for p in PATTERNS:
        m = p.search(blob)
        if not m:
            continue
        name = re.split(r"[.!?:]\s+", m.group("name"))[-1]  # never cross a sentence break
        name = re.sub(r"\s+(on|via|with|using|to|for)$", "", name.strip(" .,:;"), flags=re.I)
        if name.lower() in NOT_NAMES:
            continue
        try:
            amount = Decimal(m.group("amt").replace(",", ""))
        except InvalidOperation:
            continue
        if amount <= 0:
            continue
        note = NOTE.search(blob)
        return amount, name[:120], (note.group(1).strip() if note else "")[:200]
    return None


def gmail_confirmation(from_email, subject, text):
    """Gmail's "confirm forwarding" email: its code and link."""
    if "forwarding-noreply@google.com" not in (from_email or "").lower() and "Forwarding Confirmation" not in (subject or ""):
        return None
    code = re.search(r"#?(\d{6,12})", subject or "") or re.search(r"Confirmation code:\s*(\d{6,12})", text or "", re.I)
    link = re.search(r"https://mail(?:-settings)?\.google\.com/mail/[^\s<>\"']+", text or "")
    return (code.group(1) if code else ""), (link.group(0) if link else "")
