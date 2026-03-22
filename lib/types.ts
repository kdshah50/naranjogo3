export type TrustBadge = "none" | "bronze" | "gold" | "diamond";
export type Condition   = "new" | "like_new" | "good" | "fair";
export type ListingStatus = "draft" | "active" | "paused" | "sold" | "archived" | "flagged";
export type MessageChannel = "app" | "whatsapp";
export type PaymentRail = "stripe" | "oxxo" | "spei" | "clip";

export interface User {
  id: string;
  phone: string;
  display_name: string | null;
  avatar_url: string | null;
  trust_badge: TrustBadge;
  ine_verified: boolean;
  created_at: string;
  last_active_at: string | null;
}

export interface Listing {
  id: string;
  seller_id: string;
  title_es: string;
  title_en: string | null;
  description_es: string | null;
  price_mxn: number;          // stored in centavos
  category_id: string;
  condition: Condition;
  status: ListingStatus;
  location_state: string | null;
  location_city: string | null;
  location_colonia: string | null;
  shipping_available: boolean;
  negotiable: boolean;
  photo_urls: string[];
  ai_category_confidence: number | null;
  suggested_price_mxn: number | null;
  view_count: number;
  created_at: string;
  expires_at: string;
  // joined
  users?: Pick<User, "display_name" | "avatar_url" | "trust_badge" | "ine_verified">;
}

export interface ListingCard {
  id: string;
  title: string;
  price_mxn: number;
  category_id: string;
  condition: Condition;
  location_city: string | null;
  photo_url: string | null;
  shipping_available: boolean;
  negotiable: boolean;
  seller_name: string;
  seller_badge: TrustBadge;
  seller_verified: boolean;
}

export interface CreateListingInput {
  title_es: string;
  title_en?: string;
  description_es?: string;
  price_mxn: number;
  category_id: string;
  condition: Condition;
  location_city: string;
  location_state: string;
  shipping_available: boolean;
  negotiable: boolean;
  photo_urls: string[];
}

export interface MLAnalysisResult {
  category: string;
  confidence: number;
  suggested_price_mxn: number;
  suggested_price_min_mxn: number;
  suggested_price_max_mxn: number;
  comparables_count: number;
}
