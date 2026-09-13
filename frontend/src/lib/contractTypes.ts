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
    window_days?: number;
    mention_count?: number;
    by_source?: Record<string, number>;
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
  _meta?: { fixture?: boolean; hand_written?: boolean; schema_version?: number; note?: string };
  generated_at?: string;
  window?: { days?: number; start?: string; end?: string };
  sources_used?: string[];
  dishes: ScrapedDish[];
};

export type BudgetContract = {
  health?: { band?: string };
  allocation?: {
    monthly_revenue?: number;
    total_budget?: {
      amount?: number;
      pct_of_revenue?: number;
      binding_constraint?: string;
      benchmark_ceiling?: number;
      profit_ceiling?: number;
    };
    current_spend?: {
      current_monthly?: number;
      current_pct_of_revenue?: number;
      recommended_monthly?: number;
      delta?: number;
      direction?: string;
      multiple?: number;
    };
    breakeven?: {
      computable?: boolean;
      contribution_margin_pct?: number;
      incremental_revenue_needed?: number;
      incremental_covers_per_day?: number;
      incremental_covers_needed?: number;
      avg_check?: number;
    };
    split?: Record<string, number>;
  };
  constraints?: {
    max_trial_ingredient_spend?: number;
    max_influencer_fee?: number;
    max_paid_social_spend?: number;
    capex_available?: number;
    min_dish_margin_pct?: number;
  };
  summary?: {
    revenue?: number;
    total_expenses?: number;
    net_profit?: number;
    by_category?: Record<string, number>;
  };
  ratios?: {
    food_cost_pct?: number;
    labor_cost_pct?: number;
    prime_cost_pct?: number;
    occupancy_pct?: number;
    marketing_pct?: number;
    net_margin_pct?: number;
  };
  benchmarks?: Array<{
    metric: string;
    value: number;
    target_low: number;
    target_high: number;
    status: string;
  }>;
  rationale?: string[];
};
