export type ScrapedEvidence = {
  source: string;
  url: string;
  excerpt: string;
  engagement?: number | null;
  sentiment?: string;
  observed_at?: string;
};

export type ScrapedDish = {
  id: string;
  name: string;
  aliases?: string[];
  cuisine_tags?: string[];
  trend_score: number;
  momentum: string;
  metrics?: {
    mention_count?: number;
    total_engagement?: number;
    local_mention_count?: number;
    sentiment?: { positive?: number; negative?: number; neutral?: number };
    negative_theme?: string;
  };
  why_trending?: {
    summary?: string;
    drivers?: string[];
    audience?: string;
  };
  evidence?: ScrapedEvidence[];
};

export type TrendsContract = {
  _meta?: { fixture?: boolean; hand_written?: boolean };
  generated_at?: string;
  window?: { days?: number; start?: string; end?: string };
  sources_used?: string[];
  dishes: ScrapedDish[];
};

export type BudgetContract = {
  health?: { band?: string };
  allocation?: {
    total_budget?: { amount?: number };
    split?: Record<string, number>;
  };
  constraints?: {
    max_trial_ingredient_spend?: number;
    max_influencer_fee?: number;
    max_paid_social_spend?: number;
    capex_available?: number;
    min_dish_margin_pct?: number;
  };
};
