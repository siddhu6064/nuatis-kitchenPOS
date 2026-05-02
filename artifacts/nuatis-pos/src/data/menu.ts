export type Category = "espresso" | "coffee" | "specialty" | "food";

export interface MenuItem {
  id: string;
  name: string;
  price: number;
  category: Category;
}

export const MENU_ITEMS: MenuItem[] = [
  { id: "espresso",         name: "Espresso",         price: 3.50, category: "espresso"  },
  { id: "americano",        name: "Americano",         price: 4.00, category: "espresso"  },
  { id: "latte",            name: "Latte",             price: 5.00, category: "coffee"    },
  { id: "cappuccino",       name: "Cappuccino",        price: 4.75, category: "coffee"    },
  { id: "cold-brew",        name: "Cold Brew",         price: 5.25, category: "coffee"    },
  { id: "matcha-latte",     name: "Matcha Latte",      price: 5.50, category: "specialty" },
  { id: "chai-latte",       name: "Chai Latte",        price: 5.00, category: "specialty" },
  { id: "hot-chocolate",    name: "Hot Chocolate",     price: 4.50, category: "specialty" },
  { id: "croissant",        name: "Croissant",         price: 3.75, category: "food"      },
  { id: "blueberry-muffin", name: "Blueberry Muffin",  price: 3.50, category: "food"      },
  { id: "avocado-toast",    name: "Avocado Toast",     price: 9.50, category: "food"      },
  { id: "chicken-sandwich", name: "Chicken Sandwich",  price: 11.00, category: "food"     },
];

export const CATEGORY_COLORS: Record<Category, { bg: string; text: string; dot: string }> = {
  espresso:  { bg: "bg-amber-50",   text: "text-amber-800",  dot: "bg-amber-500"  },
  coffee:    { bg: "bg-stone-50",   text: "text-stone-700",  dot: "bg-stone-500"  },
  specialty: { bg: "bg-emerald-50", text: "text-emerald-800", dot: "bg-emerald-500" },
  food:      { bg: "bg-sky-50",     text: "text-sky-800",    dot: "bg-sky-500"    },
};
