export interface RealtimeSignal {
  id: string;
  platform: "instagram" | "tiktok" | "facebook" | "influencer" | "youtube";
  authorName: string;
  handle: string;
  authorFollowers: string;
  authorType: string;
  caption: string;
  hashtags: string[];
  views: number;
  likes: number;
  comments: number;
  shares: number;
  engagementRate: string;
  trendingAudio?: string;
  postedTime: string;
  format: string;
  duration: string;
  hookType: string;
  sentiment: string;
  badge: string;
  evidenceUrl?: string;
  topComments: string[];
}

export interface RealtimeTrendResult {
  topic: string;
  generatedAt: string;
  isRealtime: boolean;
  groundingSources: Array<{ title: string; uri: string }>;
  summary: string;
  signals: RealtimeSignal[];
}
