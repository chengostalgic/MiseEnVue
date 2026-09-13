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
      wings: ["chicken wings", "honey", "chili crisp", "butter", "all-purpose flour"],
      honey: ["chicken wings", "honey", "chili crisp", "butter"],
      birria: ["smoked brisket", "cheddar cheese", "pickles", "hot sauce", "waffle fries"],
      cucumber: ["kale", "pickles", "honey", "hot sauce"],
      cookie: ["all-purpose flour", "butter", "chocolate chips", "honey"],
      kunafa: ["butter", "chocolate chips", "honey", "pistachio"],
      mala: ["chicken thigh", "brioche bun", "buttermilk", "all-purpose flour", "hot sauce"],
      ricotta: ["brioche bun", "honey", "butter", "kale"],
      fish: ["pickles", "brioche bun", "butter"],
      corn: ["sweet corn", "cotija cheese", "butter", "hot sauce"],
      cheesecake: ["cheddar cheese", "butter", "chocolate chips", "honey"],
      falafel: ["chickpeas", "herbs", "garlic", "pita", "tahini"],
      burger: ["ground beef", "brioche bun", "cheddar cheese", "pickles"],
      matcha: ["matcha powder", "oat milk", "honey", "cold brew concentrate"],
    };

    const dishKey =
      Object.keys(dishIngredientsMap).find((key) =>
        trendingDish.name?.toLowerCase().includes(key),
      );

    const dishText = [trendingDish.name, ...(trendingDish.aliases || [])]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const tokenIngredients = Array.from(
      new Set(
        dishText
          .split(/[^a-z0-9]+/)
          .map((token: string) => token.trim())
          .filter((token: string) => token.length > 2),
      ),
    );

    const requiredIngredients = dishKey
      ? dishIngredientsMap[dishKey]
      : tokenIngredients.length > 0
        ? tokenIngredients
        : ["chicken wings", "butter"];

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
