export type KitchenExampleKind = "menu" | "inventory" | "sales" | "pnl";

export type KitchenExample = {
  kind: KitchenExampleKind;
  title: string;
  fileName: string;
  neededFor: string;
  why: string;
  columns: string;
  href: string;
  csv: string;
};

export const KITCHEN_EXAMPLES: KitchenExample[] = [
  {
    kind: "menu",
    title: "Menu",
    fileName: "ember-and-rye-menu.csv",
    neededFor: "Decide · menu fit",
    why: "What you already cook, what it costs, what you charge. Pairing looks for the closest item before it suggests a special.",
    columns: "name, description, category, price, estimated_cost",
    href: "/examples/menu.csv",
    csv: `name,description,category,price,estimated_cost
Crispy Chicken Sandwich,"Buttermilk-brined thigh, pickles, herb mayo, brioche.",Sandwiches,13.50,4.10
Nashville Hot Chicken Sandwich,"Cayenne-lacquered thigh, slaw, brioche.",Sandwiches,14.25,4.45
Smoked Brisket Sandwich,"Twelve-hour brisket, pickles, white bread.",Sandwiches,16.00,6.10
Buffalo Wings (8 pc),"Fried wings tossed in buffalo, ranch on the side.",Plates,13.00,4.80
Street Corn Elote Cup,"Charred corn, cotija, lime, chili salt.",Sides,6.50,1.65
Matcha Latte,"Ceremonial-grade matcha, oat milk.",Drinks,5.75,1.35
Brown Butter Chocolate Chip Cookie,"Browned butter, sea salt, bittersweet chocolate.",Desserts,3.75,0.72
`,
  },
  {
    kind: "inventory",
    title: "Inventory",
    fileName: "ember-and-rye-inventory.csv",
    neededFor: "Decide · can you run it",
    why: "On-hand ingredients. If chili flakes are missing, the pairing says so instead of pretending you can plate Dubai chocolate tomorrow.",
    columns: "ingredient, unit, quantity_on_hand, unit_cost",
    href: "/examples/inventory.csv",
    csv: `ingredient,unit,quantity_on_hand,unit_cost
chicken thigh,lb,48,3.25
chicken wings,lb,32,2.85
brioche bun,each,240,0.55
pickles,gal,3.5,12.00
honey,lb,6,4.75
smoked brisket,lb,22,9.80
matcha powder,oz,16,3.90
oat milk,gal,5,7.25
`,
  },
  {
    kind: "sales",
    title: "Sales",
    fileName: "ember-and-rye-sales.csv",
    neededFor: "Decide · dollar forecast",
    why: "How many of the matched item you already sell. Without this, the two-week lift is a guess and we label it that way.",
    columns: "menu_item, sold_at, quantity, revenue, channel",
    href: "/examples/sales.csv",
    csv: `menu_item,sold_at,quantity,revenue,channel
Crispy Chicken Sandwich,2026-09-10T12:15:00-05:00,26,351.00,in_store
Crispy Chicken Sandwich,2026-09-10T18:40:00-05:00,29,391.50,in_store
Smoked Brisket Sandwich,2026-09-10T12:20:00-05:00,7,112.00,online
Smoked Brisket Sandwich,2026-09-10T19:05:00-05:00,9,144.00,in_store
Buffalo Wings (8 pc),2026-09-10T18:10:00-05:00,14,182.00,in_store
Street Corn Elote Cup,2026-09-11T12:00:00-05:00,8,52.00,doordash
Matcha Latte,2026-09-11T11:30:00-05:00,12,69.00,in_store
Nashville Hot Chicken Sandwich,2026-09-11T18:25:00-05:00,18,256.50,in_store
`,
  },
  {
    kind: "pnl",
    title: "P&L",
    fileName: "ember-and-rye-pnl.csv",
    neededFor: "Budget envelope",
    why: "What you can afford to spend chasing a trend. The header caps (trial ingredients, influencer fee) come from this, not from the scrape.",
    columns: "line_item, monthly_amount",
    href: "/examples/pnl.csv",
    csv: `line_item,monthly_amount
Food Sales,142000
Beverage Sales,38000
Food COGS,47500
Hourly Labor - BOH,24000
Hourly Labor - FOH,14500
Rent,14500
Marketing & Advertising,3800
Third-Party Delivery Commissions,7200
`,
  },
];
