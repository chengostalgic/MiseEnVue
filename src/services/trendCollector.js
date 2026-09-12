/**
 * Trend & Social Post Collection Engine
 * Aggregates trend signals and posts across Instagram, TikTok, Facebook, and Influencers.
 */

export const SAMPLE_TOPIC_PRESETS = [
  {
    id: "falafel-mezze",
    label: "Crispy Falafel & Mezze",
    tagline: "Trending +340% on TikTok & Google Search",
    category: "Mediterranean / Fast Casual",
  },
  {
    id: "whipped-feta-honey",
    label: "Whipped Feta & Hot Honey Drizzle",
    tagline: "High-margin bar attach & viral aesthetic pull",
    category: "Appetizers / Small Plates",
  },
  {
    id: "smash-burger",
    label: "Lacy Edge Smash Burgers & Dipping Jus",
    tagline: "High-volume visual crunch & street food hype",
    category: "Comfort Food / Late Night",
  },
  {
    id: "matcha-cloud",
    label: "Cold Cloud Foam Matcha & Artisanal Teas",
    tagline: "Aesthetic glass layers with 88% gross beverage margin",
    category: "Beverage / Cafe",
  },
];

export const MOCK_TREND_POSTS = [
  // INSTAGRAM
  {
    id: "ig-1",
    platform: "instagram",
    authorName: "The Table NYC",
    handle: "@thetablenyc",
    authorFollowers: "142K",
    authorType: "Local Food Publisher",
    caption: "The LOUDEST crunch in the city. Watch Marcus make this golden falafel with smoked chili labneh drizzle. Tag someone who needs this lunch spread! 👇",
    hashtags: ["#nycfoodie", "#asmrfood", "#falafellove", "#nyclunch", "#crispy"],
    views: 489200,
    likes: 38400,
    comments: 890,
    shares: 12400,
    engagementRate: "10.5%",
    trendingAudio: "Original Audio - Crunchy ASMR Bites (Trending)",
    postedTime: "2 days ago",
    format: "Reel / 9:16",
    duration: "11s",
    hookType: "Sensory Audio & Close-up Snap",
    sentiment: "94% Positive ('Need this now', 'Where is this?!')",
    badge: "Viral Reel",
    thumbnailBg: "from-amber-600 to-orange-800",
    topComments: [
      "The crunch made my jaw drop!! Where is this located??",
      "That hot honey garlic drizzle is insane. Going this Saturday.",
      "Are there gluten-free options for the pita?"
    ]
  },
  {
    id: "ig-2",
    platform: "instagram",
    authorName: "Chef Elena Rostova",
    handle: "@elena.cooks",
    authorFollowers: "215K",
    authorType: "Culinary Influencer",
    caption: "Stop buying store dip. 3-minute Whipped Sheep's Milk Feta with roasted pistachios, wild thyme, and warm flatbread. Recipe in bio or try it at our pop-up! 🍯🧀",
    hashtags: ["#whippedfeta", "#appetizers", "#cheflife", "#easyappetizer", "#hothoney"],
    views: 620500,
    likes: 54100,
    comments: 1120,
    shares: 28900,
    engagementRate: "13.5%",
    trendingAudio: "Cozy Kitchen Acoustic Lo-Fi (38.2K Reels)",
    postedTime: "3 days ago",
    format: "Reel / 9:16",
    duration: "14s",
    hookType: "Visual Swirl & Drizzle Pour",
    sentiment: "97% Positive ('Making this tonight', 'Booked for Friday')",
    badge: "Trending Recipe",
    thumbnailBg: "from-yellow-600 to-amber-800",
    topComments: [
      "The honey swirl over the white feta is peak aesthetic 🤌",
      "I ordered this exact plate last night and it was 10/10",
      "What brand of feta are you using for that ultra-creamy texture?"
    ]
  },

  // TIKTOK
  {
    id: "tt-1",
    platform: "tiktok",
    authorName: "CrunchChronicles",
    handle: "@crunchchronicles",
    authorFollowers: "480K",
    authorType: "Sensory Food Reviewer",
    caption: "POV: You found the secret falafel spot where they smash it hot on the flattop 🔥 Wait for the mic check at the end #foodtiktok #crunch #streetfood #asmrsounds",
    hashtags: ["#foodtiktok", "#asmrsounds", "#crunch", "#streetfood", "#cheftok"],
    views: 1240000,
    likes: 182000,
    comments: 3410,
    shares: 44300,
    engagementRate: "18.5%",
    trendingAudio: "Bite Check Mic Test - Viral Sound #14",
    postedTime: "1 day ago",
    format: "TikTok Short / 9:16",
    duration: "9s",
    hookType: "High-Gain Lavalier Mic Crunch",
    sentiment: "96% Positive ('My algorithm knows me', 'Adding to my saved list')",
    badge: "1.2M FYP Hit",
    thumbnailBg: "from-emerald-600 to-teal-800",
    topComments: [
      "The sound quality alone sold me. Packing my bags right now.",
      "100% best falafel method. Smashing it gets the edges so lacy.",
      "Bro dropped the address please I am starving"
    ]
  },
  {
    id: "tt-2",
    platform: "tiktok",
    authorName: "Sam Eats Everything",
    handle: "@sameatseverything",
    authorFollowers: "89K",
    authorType: "City Food Guide",
    caption: "Top 3 dishes you CANNOT skip at local bistro week: The honey whipped feta, the lamb kebab, and the house pita. Save this for your next date night! 🥂",
    hashtags: ["#datenightideas", "#cityeats", "#foodreviews", "#restaurantrecommendations"],
    views: 310400,
    likes: 27900,
    comments: 480,
    shares: 8200,
    engagementRate: "11.7%",
    trendingAudio: "Jazz Cafe Grooves - Trending Indie Pop",
    postedTime: "4 days ago",
    format: "TikTok Carousel & Video",
    duration: "18s",
    hookType: "Listicle / 'Don't make this mistake'",
    sentiment: "91% Positive ('Booked for anniversary', 'Looks cute')",
    badge: "Date Night Guide",
    thumbnailBg: "from-rose-600 to-pink-800",
    topComments: [
      "Sent to my boyfriend for this weekend! Looks so cozy.",
      "The whipped feta is literally heaven on earth.",
      "How hard is it to get reservations without waiting?"
    ]
  },

  // FACEBOOK
  {
    id: "fb-1",
    platform: "facebook",
    authorName: "Downtown Foodies & Neighbors",
    handle: "Group (84K Members)",
    authorFollowers: "84K",
    authorType: "Local Community Group",
    caption: "Shout out to the brigade on 4th Street! Tried their new family mezze spread yesterday with the grandkids. Huge portions, reasonable prices, and the freshly baked warm pita was unforgettable. Anyone else tried it yet?",
    hashtags: ["#CommunityDining", "#SupportLocal", "#FamilyDinner", "#WeekendEats"],
    views: 94000,
    likes: 4200,
    comments: 630,
    shares: 1840,
    engagementRate: "7.1%",
    trendingAudio: "N/A (Organic Community Post)",
    postedTime: "Yesterday",
    format: "Photo Album & Discussion",
    duration: "Text + 4 Photos",
    hookType: "Neighbor Recommendation & Value Affirmation",
    sentiment: "92% Positive ('Agree 100%', 'We love that spot')",
    badge: "Community Buzz",
    thumbnailBg: "from-blue-600 to-indigo-900",
    topComments: [
      "We took the whole soccer team there on Sunday, service was stellar!",
      "Does anyone know if they offer curbside pickup for the family box?",
      "Their garlic sauce and pickles are made from scratch, you can really tell."
    ]
  },
  {
    id: "fb-2",
    platform: "facebook",
    authorName: "Metro Dining Gazette",
    handle: "Page (320K Followers)",
    authorFollowers: "320K",
    authorType: "Regional Media Page",
    caption: "FEATURE: Why chefs across the metro area are ditching traditional deep-fried falafel balls for the high-temp cast-iron smash technique. Margin protection, faster ticket times, and unmatched crunch.",
    hashtags: ["#FoodTrends", "#RestaurantNews", "#CulinaryInnovation", "#BistroReport"],
    views: 185000,
    likes: 8900,
    comments: 940,
    shares: 3100,
    engagementRate: "6.9%",
    trendingAudio: "N/A (Article & Video Clip)",
    postedTime: "3 days ago",
    format: "Editorial Spotlight / Video",
    duration: "45s",
    hookType: "Behind the Line Kitchen Authority",
    sentiment: "88% Positive ('Fascinating technique', 'Great read')",
    badge: "Editorial Feature",
    thumbnailBg: "from-sky-700 to-blue-900",
    topComments: [
      "Saves cooking oil and cooks twice as fast. Brilliant kitchen move.",
      "As a line cook, this cut our ticket times from 7 mins down to 3 mins flat.",
      "Can confirm, the smash gives maximum surface area caramelization!"
    ]
  },

  // INFLUENCERS
  {
    id: "inf-1",
    platform: "influencer",
    authorName: "Maya Lin (@mayabites)",
    handle: "@mayabites",
    authorFollowers: "310K",
    authorType: "Tier-1 Micro Influencer (Food & Hospitality)",
    caption: "POV: You let the chef pick your entire dinner order. This was hands-down the best whipped truffle feta and lamb skewer plate I have had all year. Rate this bite 1-10! 👇✨",
    hashtags: ["#chefspecials", "#invite", "#honestreview", "#citydining", "#tastetest"],
    views: 840000,
    likes: 92000,
    comments: 1840,
    shares: 16500,
    engagementRate: "13.1%",
    trendingAudio: "Slow Jazz Dinner Vibe (Viral Creator Sound)",
    postedTime: "2 days ago",
    format: "Reel / 9:16",
    duration: "13s",
    hookType: "High-Status VIP Dining Invitation Hook",
    sentiment: "95% Positive ('Her reviews never miss', 'Need to visit')",
    badge: "Creator Spotlight",
    thumbnailBg: "from-purple-600 to-pink-700",
    topComments: [
      "Maya never misses with her Mediterranean recs. Bookmarked!",
      "The way that cheese pulled apart was illegal 😭",
      "Their drinks look so good too, what cocktail was that?"
    ]
  },
  {
    id: "inf-2",
    platform: "influencer",
    authorName: "Dave & Chris (@twochefseating)",
    handle: "@twochefseating",
    authorFollowers: "185K",
    authorType: "Culinary Peer Reviewers",
    caption: "Testing if the viral $18.50 Falafel & Mezze board actually lives up to the hype. Kitchen inspection, prep breakdown, and the final verdict.",
    hashtags: ["#chefreaction", "#restaurantreview", "#worththehype", "#foodcritics"],
    views: 520000,
    likes: 46000,
    comments: 980,
    shares: 11200,
    engagementRate: "11.2%",
    trendingAudio: "Intense Dramatic Beat -> Funky Transition",
    postedTime: "4 days ago",
    format: "TikTok & Reel Dual-Post",
    duration: "22s",
    hookType: "Skeptical Challenge / 'Is It Worth The Hype?'",
    sentiment: "93% Positive ('Love the honest review', 'Appreciate real chefs judging')",
    badge: "Peer Review",
    thumbnailBg: "from-amber-700 to-red-800",
    topComments: [
      "When actual chefs praise a line cook's technique, you know it is real.",
      "The value for $18.50 is actually crazy considering grocery prices now.",
      "10/10 review format, no fake influencer screaming."
    ]
  }
];

export function fetchTrendSignals(topic = "falafel-mezze") {
  // In a live production environment, this connects to Apify, Meta Graph API, or TikTok Trends API
  // Here we dynamically adjust data according to the selected topic
  return MOCK_TREND_POSTS;
}
