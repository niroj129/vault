/* Shapes returned by the Django API (see the backend serializers and gaming/views.py). */

export type Money = string | number;
export type Role = "user" | "agent" | "admin";

export interface VipNext { name: string; points: number; progress: number }

export interface User {
  id: number;
  username: string;
  full_name: string;
  role: Role;
  email?: string;
  phone?: string;
  is_active?: boolean;
  last_login?: string | null;
  date_joined?: string;
  referral_code?: string;
  referral_count?: number;
  loyalty_points?: number;
  vip_tier?: string;
  vip_next?: VipNext | null;
  avatar?: string | null;
  bio?: string;
  dm_privacy?: "everyone" | "contacts" | "nobody";
  is_platform_owner?: boolean;
}

export interface AdminUser extends User {
  agent: number | null;
  agent_name: string;
  player_count: number;
  total_loaded: Money | null;
  deposit_count: number | null;
  last_deposit: string | null;
  login_count: number | null;
}

export interface Category { id: number; name: string; slug: string; icon: string; sort_order: number; game_count: number }

export interface Game {
  id: number;
  name: string;
  slug: string;
  category_name: string;
  category_slug: string;
  short_description: string;
  thumbnail: string | null;
  logo: string | null;
  status: "active" | "inactive" | "maintenance" | string;
  featured: boolean;
  is_new: boolean;
  clicks: number;
  views: number;
  features_list: string[];
  sub_points: Money;
  vendor_points: Money;
  user_link: string;
  agent_link: string;
  rating_avg: number;
  rating_count: number;
  is_favorited: boolean;
  provider: number | null;
  provider_name: string;
  self_serve: boolean;
}

export interface GameDetail extends Game {
  category: number | null;
  description: string;
  features: string;
  download_info: string;
  banner: string | null;
  play_url: string;
  meta_title: string;
  meta_description: string;
  meta_keywords: string;
  combined_points: number;
  screenshots: { id: number; image: string; alt: string; sort_order: number }[];
  faqs: { id: number; question: string; answer: string; sort_order: number }[];
  created_at: string;
  provider_game_code: string;
}

export interface SiteSettings {
  site_name?: string;
  tagline?: string;
  logo?: string | null;
  favicon?: string | null;
  social_preview?: string | null;
  color_primary?: string;
  color_secondary?: string;
  color_accent?: string;
  currency?: string;
  signup_url?: string;
  maintenance_mode?: boolean;
  allow_signup?: boolean;
  redeem_enabled?: boolean;
  bp_methods?: string;
  load_bonus_percent?: Money;
  features?: Record<string, boolean>;
  is_platform?: boolean;
  [key: string]: unknown;
}

export interface BusinessInfo {
  business_name?: string; email?: string; phone?: string; whatsapp?: string; telegram?: string;
  facebook?: string; instagram?: string; address?: string; map_embed?: string;
  about?: string; terms?: string; privacy?: string;
}

export interface Winner { id: number; name: string; amount: Money; game: string; photo: string | null; win_date: string }
export interface Promo { id: number; title: string; code: string; description: string; image: string | null; active: boolean; expires: string | null }
export interface SiteFAQ { id: number; question: string; answer: string; category: string }
export interface Announcement { id: number; title: string; body: string; pinned: boolean; active: boolean }
export interface Notification { id: number; text: string; link: string; is_read: boolean; created_at: string }
export interface PaymentMethodInfo { id: number; name: string; active?: boolean; [k: string]: unknown }

/* ---------- money: loads, QR payments, cash outs ---------- */

export interface GameLogin {
  id: number; username: string; password: string | null; note: string;
  platform_user_id: string; created_via_api: boolean;
  last_balance: string; last_balance_at: string | null;
}

export interface GameBrief { id: number; name: string; slug: string; thumbnail: string | null; logo: string | null; play_url: string; automated?: boolean }

/** Cash-out rule: each cash out is min×–max× the player's last load on that game (one cash out per load). */
export type CashoutBasis = "loaded" | "deposit";
export interface CashoutLoad { reference: string; amount: Money; loaded_amount: Money | null; loaded_at: string | null }
export interface CashoutRule {
  enabled: boolean; ok: boolean; reason: string; basis: CashoutBasis; min_x: Money; max_x: Money;
  min: Money; max: Money | null; base: Money | null; load: CashoutLoad | null;
}
export interface RedeemRule { basis: CashoutBasis; base: Money; min: Money; max: Money; min_x: Money; max_x: Money; within: boolean; load: CashoutLoad }

export interface PlayGame extends GameBrief { automated: boolean; self_serve: boolean; login: GameLogin | null; cashout: CashoutRule | null }

export interface DirectMethod {
  id: number; key: string; name: string; handle: string; account_name: string; qr: string | null;
  instructions: string; min: Money; max: Money; amounts: number[]; proof: "required" | "optional" | "off";
}

export interface GatewayMethod { key: string; label: string; amounts: number[] }

export interface PlayOptions {
  payments_on: boolean;
  methods: GatewayMethod[];
  direct_methods: DirectMethod[];
  bonus_percent: Money;
  auto_load: boolean;
  redeem: { enabled: boolean; min: Money; proof: "required" | "optional" | "off"; methods: string[]; rule: { enabled: boolean; min_x: Money; max_x: Money; basis: CashoutBasis } };
  games: PlayGame[];
}

export type DepositStatus = "pending" | "approved" | "rejected" | "expired" | "failed";
export type LoadStatus = "waiting" | "queued" | "loading" | "loaded" | "failed" | "manual" | "skipped";

export interface Deposit {
  id: number; reference: string; code: string; method: string; method_label: string;
  direct: boolean; proof: string | null; player_note: string; reason: string;
  pay_to: { handle: string; account_name: string; qr: string | null } | null;
  amount: Money; fee_amount: Money; credit_amount: Money;
  status: DepositStatus; status_label: string; load_status: LoadStatus; load_label: string;
  checkout_url: string; tag: string; tag_email: string; expires_at: string | null;
  created_at: string; approved_at: string | null; loaded_at: string | null; loaded_amount: Money | null;
  game: GameBrief | null;
}

/** A forwarded payment email matched to a QR payment (evidence only; staff still approve). */
export type MailMatch = "code" | "likely" | "linked" | "none" | "na";
export interface MailEvidence { id: number; app: string; amount: Money | null; payer: string; note: string; subject: string;
  verified: boolean; match: MailMatch; match_label: string; received_at: string }

export interface StaffDeposit extends Deposit {
  user: { id: number; username: string; full_name: string };
  load_error: string; gateway: string; gateway_id: string; note: string;
  created_by: string; login: string; checked_by: string; last_synced: string | null;
  emails?: MailEvidence[];
}

export interface InboundEmail extends Omit<MailEvidence, "match_label"> {
  from_email: string; from_name: string; kind: "payment" | "gmail_confirm" | "other"; kind_label: string; match_label: string;
  is_read: boolean; archived: boolean; confirm_code: string; confirm_link: string; preview: string;
  deposit: { id: number; code: string; amount: Money; status: string; status_label: string; username: string; player_note: string; method: string; created_at: string } | null;
  text?: string; to?: string; sent_at?: string | null; provider?: string; linked_by?: string;
}

export type RedeemStatus = "pending" | "approved" | "paid" | "rejected" | "failed";

export interface Redeem {
  id: number; amount: Money; payout_method: string; payout_label: string; payout_handle: string;
  status: RedeemStatus; status_label: string; note: string; created_at: string; handled_at: string | null;
  proof: string | null; player_proof: string | null; game: GameBrief | null; rule: RedeemRule | null;
}

export interface StaffRedeem extends Redeem {
  user: { id: number; username: string; full_name: string };
  error: string; login: string; handled_by: string;
}

export interface PayMethodAdmin {
  id: number; key: string; name: string; replaces: string; handle: string; account_name: string; qr: string | null;
  instructions: string; min_amount: Money; max_amount: Money; quick_amounts: string;
  proof: "required" | "optional" | "off"; is_active: boolean; sort_order: number; deposit_count: number;
}

/* ---------- messenger ---------- */

export interface UserBrief { id: number; username: string; full_name: string; role: Role; avatar: string | null; online: boolean | null; last_seen: string | null }

export interface ChatMessage {
  id: number; conversation: number; sender: number | null; sender_name: string;
  kind: "text" | "system" | "sms_in" | "sms_out"; body: string; image: string | null;
  sms_status: string; channel?: "sms" | "whatsapp" | "sendblue" | ""; created_at: string; edited_at: string | null; deleted: boolean;
}

export interface Conversation {
  id: number; kind: "direct" | "group" | "support" | "sms"; channel: "sms" | "whatsapp" | "sendblue"; title: string; raw_title: string; phone: string;
  avatar: string | null; subject: UserBrief | null; pinned: boolean;
  members: (UserBrief & { member_role: string })[]; my_role: string; unread: number;
  last_message: ChatMessage | null; updated_at: string; can_send: boolean; send_block_reason: string; blocked: boolean;
}
