import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { inventoryItems, trendingDish } = await req.json();
    if (!Array.isArray(inventoryItems) || !trendingDish) {
      return NextResponse.json(
        { error: "Missing inventoryItems or trendingDish" },
        { status: 400 },
      );
    }

    const dishIngredientsMap: Record<string, string[]> = {
      falafel: ["chickpeas", "herbs", "garlic", "pita", "tahini", "oil", "greens"],
      feta: ["feta", "honey", "chili", "pistachio", "pita", "olive oil", "thyme"],
      wings: ["wings", "chicken", "honey", "chili crisp", "garlic", "butter", "oil"],
      burger: ["ground beef", "buns", "cheese", "onions", "pickles", "sauce"],
      matcha: ["matcha", "milk", "oat milk", "vanilla", "ice", "honey", "syrup"],
      honey: ["chicken", "honey", "bun", "pickles", "chili"],
    };

    const dishKey =
      Object.keys(dishIngredientsMap).find((key) =>
        trendingDish.name?.toLowerCase().includes(key),
      ) || "falafel";

    const requiredIngredients = dishIngredientsMap[dishKey];
    const inventoryText = inventoryItems
      .map((item: Record<string, unknown>) => Object.values(item).join(" ").toLowerCase())
      .join(" ");

    const matchedIngredients = requiredIngredients.filter((ing) =>
      inventoryText.includes(ing),
    );
    const missingIngredients = requiredIngredients.filter(
      (ing) => !inventoryText.includes(ing),
    );
    const coveragePercent = Math.round(
      (matchedIngredients.length / requiredIngredients.length) * 100,
    );

    return NextResponse.json({
      success: true,
      dishName: trendingDish.name || "Trending Dish",
      coveragePercent,
      isFeasible: coveragePercent >= 50,
      matchedIngredients,
      missingIngredients,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Fit analysis failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
