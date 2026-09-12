import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { inventoryItems, trendingDish } = await req.json();

    if (!Array.isArray(inventoryItems) || !trendingDish) {
      return NextResponse.json(
        { error: "Missing inventoryItems or trendingDish" },
        { status: 400 }
      );
    }

    // Common ingredient signatures for viral Mediterranean & bistro items
    const dishIngredientsMap: Record<string, string[]> = {
      falafel: ["chickpeas", "herbs", "garlic", "pita", "tahini", "oil", "greens"],
      feta: ["feta", "honey", "chili", "pistachio", "pita", "olive oil", "thyme"],
      wings: ["wings", "chicken", "honey", "chili crisp", "garlic", "butter", "oil"],
      burger: ["ground beef", "buns", "cheese", "onions", "pickles", "sauce"],
      matcha: ["matcha", "milk", "oat milk", "vanilla", "ice", "honey", "syrup"],
    };

    const dishKey = Object.keys(dishIngredientsMap).find((k) =>
      trendingDish.name?.toLowerCase().includes(k)
    ) || "falafel";

    const requiredIngredients = dishIngredientsMap[dishKey] || ["protein", "produce", "seasoning", "bread"];

    // Match inventory
    const inventoryText = inventoryItems
      .map((item: any) => Object.values(item).join(" ").toLowerCase())
      .join(" ");

    const matchedIngredients = requiredIngredients.filter((ing) => inventoryText.includes(ing));
    const missingIngredients = requiredIngredients.filter((ing) => !inventoryText.includes(ing));
    const coveragePercent = Math.round((matchedIngredients.length / requiredIngredients.length) * 100);

    const estimatedPlateCost = coveragePercent > 70 ? 3.4 : 5.8;
    const suggestedPrice = 18.5;
    const projectedMargin = Math.round(((suggestedPrice - estimatedPlateCost) / suggestedPrice) * 100);

    return NextResponse.json({
      success: true,
      dishName: trendingDish.name || "Trending Dish",
      coveragePercent,
      isFeasible: coveragePercent >= 50,
      matchedIngredients,
      missingIngredients,
      financials: {
        estimatedPlateCost,
        suggestedPrice,
        projectedMargin: `${projectedMargin}%`,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("Fit analysis error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
