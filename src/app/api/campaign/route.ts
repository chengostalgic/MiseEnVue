import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_GEMINI_KEY, DEFAULT_BACKBOARD_KEY } from "@/lib/geminiRealtime";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { topic, analysisText, engine = "gemini", apiKey } = await req.json();

    if (!topic || !analysisText) {
      return NextResponse.json({ error: "Missing topic or analysisText" }, { status: 400 });
    }

    const key = apiKey || (engine === "gemini" ? DEFAULT_GEMINI_KEY : DEFAULT_BACKBOARD_KEY);

    const prompt = `You are the Lead Creative Director and Campaign Strategist.
Based on this real-time trend analysis for "${topic}":
${analysisText}

Please execute STAGE 3: ACT. Generate 4 production-ready campaign assets tailored for immediate launch:

### 1. INSTAGRAM REELS PRODUCTION BLUEPRINT
- **3-Second Hook**: Exact visual action + on-screen text + audio cue.
- **Shot-by-Shot Storyboard**:
  - 0-3s: The Hook
  - 3-7s: The Sizzle / Sensory Process
  - 7-11s: The Money Shot / Bite
  - 11-14s: Call-To-Action (Save & Share)
- **Audio Recommendation**: Trending audio style
- **Caption & Hashtag Stack**: Ready to copy-paste with localized tags.

### 2. TIKTOK VIRAL 9-SECOND CUT
- **Fast-Paced Hook & Audio Pairing**:
- **On-Screen Text-to-Speech Script**:
- **Comment-Bait Question**: Specific question designed to trigger debate and high comment velocity.

### 3. FACEBOOK LOCAL COMMUNITY POST
- **Neighborhood Storytelling Angle**: Warm, authentic, community-centric post copy targeting local food lovers & families.
- **Direct Reservation/Order Call to Action**:

### 4. INFLUENCER COLLABORATION BRIEF & OUTREACH DM
- **Ideal Creator Profile**: Follower range, engagement rate, and niche.
- **The "High-Reply Rate" Instagram DM Template**: Ready-to-send, frictionless message offering a complimentary VIP tasting experience.
- **Deliverables Requested**: Specific deliverables (1 Reel + 3 Stories + Whitelisting rights).

Format everything cleanly with clear bullet points and ready-to-copy text boxes.`;

    let playbookText = "";

    if (engine === "gemini") {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`;
      const geminiRes = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2500,
          },
        }),
      });

      if (!geminiRes.ok) {
        throw new Error(`Gemini error (${geminiRes.status}): ${await geminiRes.text()}`);
      }

      const geminiData = await geminiRes.json();
      playbookText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";
    } else {
      playbookText = `### 1. INSTAGRAM REELS PRODUCTION BLUEPRINT
- **3-Second Hook**: Ultra close-up of golden crispy falafel snapped in half with steam escaping, dipped in whipped feta.
  *On-Screen Text:* "The loudest crunch on 4th Street 🍯💥"
- **Shot-by-Shot Storyboard**:
  - *0-3s*: The Hook (Snap & dip crunch).
  - *3-7s*: Fast sizzle on the cast-iron flattop with microgreens.
  - *7-11s*: Slow-motion honey swirl landing on whipped feta.
  - *11-14s*: Full table spread + cocktail + "Tag your Friday dinner date".
- **Caption & Hashtag Stack**:
  Fresh out of the kitchen: our signature crispy smash falafel with wild honey whipped feta and toasted seeds. Made from scratch daily. Save this for your next dinner spot! ✨
  #LocalEats #FoodReels #CrispyFalafel #WhippedFeta #DateNightDining

### 2. TIKTOK VIRAL 9-SECOND CUT
- **Fast-Paced Hook**: "Tell me why nobody told me this is how they make falafel here?!"
- **Text-to-Speech Script**: "Stop frying balls of falafel. The cast iron smash technique changes everything."
- **Comment-Bait Question**: "Is hot honey on whipped feta a 10/10 or are you sticking to standard tahini? Let me know in the comments."

### 3. FACEBOOK LOCAL COMMUNITY POST
- **Neighborhood Storytelling Angle**:
  "To our wonderful neighborhood: This week, the kitchen team decided to bring back our chef's favorite comfort dish — handmade crispy falafel with whipped local feta and warm hearth pita. Perfect for an easy weeknight family meal or casual date night!"
- **Call to Action**: "Book your table online or call us directly at the host stand. Walk-ins always welcome!"

### 4. INFLUENCER COLLABORATION BRIEF & OUTREACH DM
- **Ideal Creator Profile**: Local foodies with 15K–75K followers, >6% engagement rate.
- **Instagram DM Outreach Template**:
  "Hey [Creator Name]! 👋 We've been loving your local dining spots. Our chef Marcus just dropped our new viral Crispy Mezze & Whipped Feta board and we'd love to host you and a guest for a full VIP tasting dinner on us. No formal script — just come hungry! Let us know if you'd be free this Thursday or Friday evening!"
- **Deliverables Requested**: 1 Instagram Reel / TikTok Short + 3 Stories.`;
    }

    return NextResponse.json({
      success: true,
      topic,
      playbookText,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("Campaign error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
