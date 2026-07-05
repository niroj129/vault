import { getJSONSafe } from "../../lib/api";
import ContactForm from "../../components/ContactForm";

export const revalidate = 60;
export const metadata = {
  title: "Business Contact",
  description: "Contact Tiffany Gaming — phone, email, WhatsApp, Telegram and our support team for game links and agent info.",
};

export default async function BusinessPage() {
  const b = await getJSONSafe("/business/", {});
  return (
    <section className="wrap section">
      <div className="head"><div><span className="kicker">Get in touch</span><h2>Business Contact</h2></div></div>
      <div className="grid two">
        <div className="card" style={{ padding: "1.8rem" }}>
          <h3>{b.business_name || "Tiffany Gaming"}</h3>
          <ul className="biz-list">
            {b.phone && <li>📞 <b>Phone:</b> <a href={`tel:${b.phone}`}>{b.phone}</a></li>}
            {b.email && <li>✉️ <b>Email:</b> <a href={`mailto:${b.email}`}>{b.email}</a></li>}
            {b.whatsapp && <li>💬 <b>WhatsApp:</b> <a href={`https://wa.me/${(b.whatsapp || "").replace(/[^0-9]/g, "")}`} target="_blank" rel="noopener">{b.whatsapp}</a></li>}
            {b.telegram && <li>✈️ <b>Telegram:</b> <a href={b.telegram} target="_blank" rel="noopener">Message us</a></li>}
            {b.facebook && <li>📘 <b>Facebook:</b> <a href={b.facebook} target="_blank" rel="noopener">Follow</a></li>}
            {b.instagram && <li>📸 <b>Instagram:</b> <a href={b.instagram} target="_blank" rel="noopener">Follow</a></li>}
            {b.address && <li>📍 <b>Address:</b> {b.address}</li>}
          </ul>
          {b.map_embed && <div className="map-embed" dangerouslySetInnerHTML={{ __html: b.map_embed }} />}
        </div>
        <div className="card" style={{ padding: "1.8rem" }}>
          <h3>Send a Message</h3>
          <ContactForm />
        </div>
      </div>

      <div className="card" id="about" style={{ padding: "1.8rem", marginTop: "1.4rem" }}>
        <h3>About Us</h3><p className="muted">{b.about}</p>
      </div>
      <div className="grid two" style={{ marginTop: "1.4rem" }}>
        <div className="card" id="terms" style={{ padding: "1.8rem" }}><h3>Terms & Conditions</h3><p className="muted">{b.terms}</p></div>
        <div className="card" id="privacy" style={{ padding: "1.8rem" }}><h3>Privacy Policy</h3><p className="muted">{b.privacy}</p></div>
      </div>
    </section>
  );
}
