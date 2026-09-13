export type AudienceAsk = {
  comment: string;
  ask: string;
  kind: "constraint" | "variant" | "request";
};

export type LabPost = {
  id: string;
  title: string;
  channel: string;
  url: string;
  views: number;
  query: string;
  comments: string[];
  asks: AudienceAsk[];
  operatorDish: string | null;
  operatorDishId: string | null;
  fate: string;
};

export type SignalLab = {
  generatedAt: string;
  rawPath: string;
  source: string;
  videoCount: number;
  commentCount: number;
  askCount: number;
  shownToOperator: number;
  asksNotShipped: number;
  posts: LabPost[];
  asks: Array<AudienceAsk & { videoId: string; videoTitle: string; url: string; operatorDish: string | null }>;
};
