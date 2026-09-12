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

    const dishText = [trendingDish.name, ...(trendingDish.aliases || [])]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const requiredIngredients = Array.from(
      new Set(
        dishText
          .split(/[^a-z0-9]+/)
          .map((token: string) => token.trim())
          .filter((token: string) => token.length > 2),
      ),
    );

    if (requiredIngredients.length === 0) {
      return NextResponse.json({
        success: true,
        dishName: trendingDish.name || "Trending Dish",
        coveragePercent: 0,
        isFeasible: false,
        matchedIngredients: [],
        missingIngredients: [],
        timestamp: new Date().toISOString(),
      });
    }
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
