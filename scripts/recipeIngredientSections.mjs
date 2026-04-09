/** @typedef {{ ingredientId: string, amount: number|null, unit: string|null, note?: string }} L */
/** @typedef {{ name: string, lines: L[] }} S */

/** @type {Record<string, S[]>} */
export const SECTIONS = {
  "chicken-air-fried": [
    {
      "name": "Main",
      "lines": [
        {
          "ingredientId": "chicken-breast",
          "amount": 8,
          "unit": "oz",
          "note": "with olive oil & cajun rub (or other spice mix)"
        }
      ]
    },
    {
      "name": "Optional spice mix",
      "lines": [
        {
          "ingredientId": "italian-seasoning",
          "amount": 1,
          "unit": "tbsp"
        },
        {
          "ingredientId": "garlic-powder",
          "amount": 1,
          "unit": "tsp"
        },
        {
          "ingredientId": "paprika",
          "amount": 0.5,
          "unit": "tsp"
        },
        {
          "ingredientId": "salt-and-pepper",
          "amount": 1,
          "unit": "tsp"
        }
      ]
    }
  ],
  "grilled-tri-tip": [
    {
      "name": "Main",
      "lines": [
        {
          "ingredientId": "tri-tip",
          "amount": 2.5,
          "unit": "lb"
        },
        {
          "ingredientId": "stubbs-rub",
          "amount": 8,
          "unit": "tbsp"
        }
      ]
    }
  ],
  "grilled-burger": [
    {
      "name": "Main",
      "lines": [
        {
          "ingredientId": "burger-patty",
          "amount": 2,
          "unit": "each"
        },
        {
          "ingredientId": "all-purpose-seasoning",
          "amount": 1,
          "unit": "tsp"
        }
      ]
    }
  ],
  "grilled-hot-link": [
    {
      "name": "Main",
      "lines": [
        {
          "ingredientId": "hot-link",
          "amount": 2,
          "unit": "each"
        }
      ]
    }
  ],
  "grilled-wings": [
    {
      "name": "Main",
      "lines": [
        {
          "ingredientId": "wings",
          "amount": 1,
          "unit": "lb"
        },
        {
          "ingredientId": "franks-hot-sauce",
          "amount": 0.5,
          "unit": "container",
          "note": "~0.5 bottle per lb wings"
        }
      ]
    }
  ],
  "grilled-carne-asada": [
    {
      "name": "Main",
      "lines": [
        {
          "ingredientId": "carne-asada",
          "amount": 8,
          "unit": "oz"
        }
      ]
    }
  ],
  "grilled-chicken": [
    {
      "name": "Main",
      "lines": [
        {
          "ingredientId": "chicken-breast",
          "amount": 8,
          "unit": "oz",
          "note": "grilled"
        },
        {
          "ingredientId": "grill-mates-spice",
          "amount": 4,
          "unit": "tbsp"
        }
      ]
    }
  ],
  "pot-roast-keto": [
    {
      "name": "Main",
      "lines": [
        {
          "ingredientId": "chuck-roast",
          "amount": 2,
          "unit": "lb",
          "note": "2–4 lb"
        },
        {
          "ingredientId": "salt-and-pepper",
          "amount": 2,
          "unit": "tbsp"
        },
        {
          "ingredientId": "onion",
          "amount": 1,
          "unit": "each"
        },
        {
          "ingredientId": "mushrooms",
          "amount": 1,
          "unit": "container"
        },
        {
          "ingredientId": "beef-broth",
          "amount": 1,
          "unit": "cup",
          "note": "½ cup per lb roast"
        },
        {
          "ingredientId": "parsley",
          "amount": 1,
          "unit": "bunch",
          "note": "optional"
        }
      ]
    }
  ],
  "taco-chicken-crock-pot": [
    {
      "name": "Main",
      "lines": [
        {
          "ingredientId": "chicken-breast",
          "amount": 4,
          "unit": "lb",
          "note": "4–7 lb"
        },
        {
          "ingredientId": "pace-hot-salsa",
          "amount": 2,
          "unit": "container"
        },
        {
          "ingredientId": "taco-seasoning",
          "amount": 2,
          "unit": "pack"
        },
        {
          "ingredientId": "bell-pepper",
          "amount": 2,
          "unit": "each"
        },
        {
          "ingredientId": "onion",
          "amount": 2,
          "unit": "each"
        },
        {
          "ingredientId": "avocado",
          "amount": 1,
          "unit": "each",
          "note": "optional"
        },
        {
          "ingredientId": "blue-corn-tortilla-chips",
          "amount": 1,
          "unit": "container",
          "note": "optional"
        },
        {
          "ingredientId": "rice-optional-side",
          "amount": null,
          "unit": null
        },
        {
          "ingredientId": "quesadilla-shell",
          "amount": null,
          "unit": null
        }
      ]
    }
  ],
  "meatballs-keto": [
    {
      "name": "Main",
      "lines": [
        {
          "ingredientId": "ground-beef",
          "amount": 2,
          "unit": "lb"
        },
        {
          "ingredientId": "ground-pork",
          "amount": 1,
          "unit": "lb"
        },
        {
          "ingredientId": "parmesan-cheese",
          "amount": 1.5,
          "unit": "cup",
          "note": "grated"
        },
        {
          "ingredientId": "breadcrumbs-or-pork-rinds",
          "amount": 1,
          "unit": "cup"
        },
        {
          "ingredientId": "egg",
          "amount": 4,
          "unit": "each"
        },
        {
          "ingredientId": "salt",
          "amount": 2,
          "unit": "tsp"
        },
        {
          "ingredientId": "black-pepper",
          "amount": 0.5,
          "unit": "tsp"
        },
        {
          "ingredientId": "garlic-powder",
          "amount": 0.5,
          "unit": "tsp"
        },
        {
          "ingredientId": "onion-powder",
          "amount": 2,
          "unit": "tsp"
        },
        {
          "ingredientId": "oregano-dried",
          "amount": 0.5,
          "unit": "tsp"
        },
        {
          "ingredientId": "warm-water",
          "amount": 1,
          "unit": "cup"
        }
      ]
    },
    {
      "name": "Topping",
      "lines": [
        {
          "ingredientId": "mozzarella-topping",
          "amount": 1,
          "unit": "handful"
        },
        {
          "ingredientId": "tomato-sauce",
          "amount": 2,
          "unit": "cup"
        }
      ]
    }
  ],
  "sausage-pasta": [
    {
      "name": "Main",
      "lines": [
        {
          "ingredientId": "italian-sausage",
          "amount": 1,
          "unit": "lb"
        },
        {
          "ingredientId": "pasta-tricolor",
          "amount": 1,
          "unit": "box"
        }
      ]
    },
    {
      "name": "Topping",
      "lines": [
        {
          "ingredientId": "tomato-sauce",
          "amount": 1,
          "unit": "cup"
        },
        {
          "ingredientId": "cheese-mexican-blend",
          "amount": 0.5,
          "unit": "cup"
        },
        {
          "ingredientId": "red-pepper",
          "amount": 1,
          "unit": "container"
        }
      ]
    }
  ],
  "mozzarella-crusted-chicken": [
    {
      "name": "Main",
      "lines": [
        {
          "ingredientId": "chicken-breast",
          "amount": 10,
          "unit": "oz"
        },
        {
          "ingredientId": "panko",
          "amount": 0.25,
          "unit": "cup"
        },
        {
          "ingredientId": "mozzarella-cheese",
          "amount": 0.5,
          "unit": "cup",
          "note": "shredded"
        },
        {
          "ingredientId": "italian-seasoning",
          "amount": 1,
          "unit": "tbsp"
        },
        {
          "ingredientId": "sour-cream",
          "amount": 1.5,
          "unit": "tbsp"
        },
        {
          "ingredientId": "olive-oil",
          "amount": 1,
          "unit": "tbsp",
          "note": "with salt & pepper"
        }
      ]
    },
    {
      "name": "Sides",
      "lines": [
        {
          "ingredientId": "couscous-or-pasta",
          "amount": null,
          "unit": null
        },
        {
          "ingredientId": "carrots",
          "amount": 1,
          "unit": "pack"
        }
      ]
    }
  ],
  "dijon-onion-chicken": [
    {
      "name": "Main",
      "lines": [
        {
          "ingredientId": "chicken-breast",
          "amount": 10,
          "unit": "oz"
        },
        {
          "ingredientId": "dressing-honey-dijon",
          "amount": 1,
          "unit": "tbsp"
        },
        {
          "ingredientId": "fried-onion-crisps",
          "amount": 1.5,
          "unit": "handful",
          "note": "1½ handfuls"
        },
        {
          "ingredientId": "monterey-jack-cheese",
          "amount": 0.25,
          "unit": "cup"
        }
      ]
    },
    {
      "name": "Sides",
      "lines": [
        {
          "ingredientId": "garlic-bread",
          "amount": 1,
          "unit": "each"
        },
        {
          "ingredientId": "green-beans",
          "amount": 1,
          "unit": "handful"
        }
      ]
    }
  ],
  "cayenne-breaded-chicken": [
    {
      "name": "Main",
      "lines": [
        {
          "ingredientId": "chicken-breast",
          "amount": 10,
          "unit": "oz"
        },
        {
          "ingredientId": "panko",
          "amount": 0.25,
          "unit": "cup"
        },
        {
          "ingredientId": "monterey-jack-cheese",
          "amount": 0.25,
          "unit": "cup",
          "note": "shredded"
        },
        {
          "ingredientId": "franks-seasoning-blend",
          "amount": 0.25,
          "unit": "oz"
        },
        {
          "ingredientId": "sour-cream",
          "amount": 1.5,
          "unit": "tbsp"
        },
        {
          "ingredientId": "honey",
          "amount": 2,
          "unit": "tsp",
          "note": "optional"
        }
      ]
    }
  ],
  "lemon-italian-chicken-spaghetti": [
    {
      "name": "Main",
      "lines": [
        {
          "ingredientId": "chicken-breast",
          "amount": 10,
          "unit": "oz"
        },
        {
          "ingredientId": "italian-seasoning",
          "amount": 1,
          "unit": "tbsp"
        }
      ]
    },
    {
      "name": "Side",
      "lines": [
        {
          "ingredientId": "zucchini",
          "amount": 1,
          "unit": "each"
        },
        {
          "ingredientId": "lemon",
          "amount": 1,
          "unit": "each"
        },
        {
          "ingredientId": "chili-flakes",
          "amount": 1,
          "unit": "tsp"
        },
        {
          "ingredientId": "sour-cream",
          "amount": 1.5,
          "unit": "tsp"
        },
        {
          "ingredientId": "chicken-stock-concentrate",
          "amount": 1,
          "unit": "pouch"
        },
        {
          "ingredientId": "parmesan-cheese",
          "amount": 3,
          "unit": "tbsp"
        },
        {
          "ingredientId": "spaghetti",
          "amount": 6,
          "unit": "oz"
        },
        {
          "ingredientId": "garlic",
          "amount": 1,
          "unit": "clove"
        },
        {
          "ingredientId": "butter",
          "amount": 1,
          "unit": "tbsp"
        }
      ]
    }
  ],
  "chicken-pita-pockets": [
    {
      "name": "Main",
      "lines": [
        {
          "ingredientId": "chicken-breast",
          "amount": 10,
          "unit": "oz"
        },
        {
          "ingredientId": "cucumber-mini",
          "amount": 1,
          "unit": "each"
        },
        {
          "ingredientId": "garlic-powder",
          "amount": 1,
          "unit": "tsp"
        },
        {
          "ingredientId": "dressing-greek-vinaigrette",
          "amount": 1,
          "unit": "tbsp",
          "note": "splash"
        },
        {
          "ingredientId": "pita-bread",
          "amount": 2,
          "unit": "piece"
        },
        {
          "ingredientId": "hummus",
          "amount": 2,
          "unit": "tbsp"
        }
      ]
    }
  ],
  "miso-salmon": [
    {
      "name": "Main",
      "lines": [
        {
          "ingredientId": "salmon-fillet",
          "amount": 10,
          "unit": "oz"
        }
      ]
    },
    {
      "name": "Sauce",
      "lines": [
        {
          "ingredientId": "miso-paste",
          "amount": 1,
          "unit": "tbsp"
        },
        {
          "ingredientId": "honey",
          "amount": 2,
          "unit": "tsp"
        },
        {
          "ingredientId": "hot-water",
          "amount": 2,
          "unit": "tbsp"
        }
      ]
    },
    {
      "name": "Sides",
      "lines": [
        {
          "ingredientId": "fried-rice-optional",
          "amount": 1,
          "unit": "each"
        }
      ]
    }
  ],
  "curry-peanut-chicken": [
    {
      "name": "Main",
      "lines": [
        {
          "ingredientId": "chicken-breast",
          "amount": 10,
          "unit": "oz"
        },
        {
          "ingredientId": "cornstarch",
          "amount": 0.25,
          "unit": "cup"
        }
      ]
    },
    {
      "name": "Peanut Sauce",
      "lines": [
        {
          "ingredientId": "peanuts-roasted",
          "amount": 3,
          "unit": "tbsp",
          "note": "topping"
        },
        {
          "ingredientId": "peanut-butter",
          "amount": 1,
          "unit": "tbsp"
        },
        {
          "ingredientId": "curry-paste-yellow",
          "amount": 1,
          "unit": "tbsp"
        },
        {
          "ingredientId": "mayonnaise",
          "amount": 2,
          "unit": "tbsp"
        },
        {
          "ingredientId": "mirin",
          "amount": 1,
          "unit": "tbsp"
        },
        {
          "ingredientId": "warm-water",
          "amount": 2,
          "unit": "tbsp"
        }
      ]
    },
    {
      "name": "Sides",
      "lines": [
        {
          "ingredientId": "rice-cooked",
          "amount": 0.5,
          "unit": "cup"
        },
        {
          "ingredientId": "carrots",
          "amount": null,
          "unit": null,
          "note": "cucumber, scallions, ACV 1 tbsp — optional"
        }
      ]
    }
  ],
  "soy-glazed-meatloaf": [
    {
      "name": "Main",
      "lines": [
        {
          "ingredientId": "ground-beef",
          "amount": 16,
          "unit": "oz",
          "note": "85–90% lean"
        },
        {
          "ingredientId": "egg",
          "amount": 2,
          "unit": "each"
        },
        {
          "ingredientId": "breadcrumbs",
          "amount": 0.5,
          "unit": "cup"
        },
        {
          "ingredientId": "garlic",
          "amount": 3,
          "unit": "clove",
          "note": "paste"
        },
        {
          "ingredientId": "mccormick-meatloaf-seasoning",
          "amount": 0.33,
          "unit": "pack"
        }
      ]
    },
    {
      "name": "Sauce",
      "lines": [
        {
          "ingredientId": "soy-glaze",
          "amount": 2,
          "unit": "tbsp"
        },
        {
          "ingredientId": "cumin-sichuan-sauce",
          "amount": 3,
          "unit": "tbsp"
        },
        {
          "ingredientId": "rice-vinegar",
          "amount": 0.5,
          "unit": "tbsp"
        },
        {
          "ingredientId": "kinders-glaze",
          "amount": 0.5,
          "unit": "cup",
          "note": "¼ cup before + ¼ cup after OR"
        }
      ]
    },
    {
      "name": "Alternate sauce (mushroom sauce)",
      "lines": [
        {
          "ingredientId": "mushroom-button",
          "amount": 4,
          "unit": "oz"
        },
        {
          "ingredientId": "beef-stock-concentrate",
          "amount": 1,
          "unit": "pouch"
        },
        {
          "ingredientId": "water",
          "amount": 0.25,
          "unit": "cup"
        },
        {
          "ingredientId": "sour-cream",
          "amount": 1.5,
          "unit": "tbsp"
        },
        {
          "ingredientId": "butter",
          "amount": 1,
          "unit": "tbsp",
          "note": "finish sauce"
        }
      ]
    }
  ],
  "steak-spicy-soy-sauce": [
    {
      "name": "Main",
      "lines": [
        {
          "ingredientId": "sirloin-steak",
          "amount": 10,
          "unit": "oz",
          "note": "two 5 oz steaks"
        }
      ]
    },
    {
      "name": "Sauce",
      "lines": [
        {
          "ingredientId": "soy-glaze",
          "amount": 2,
          "unit": "tbsp"
        },
        {
          "ingredientId": "rice-vinegar",
          "amount": 1,
          "unit": "tbsp"
        },
        {
          "ingredientId": "water",
          "amount": 2,
          "unit": "tbsp"
        },
        {
          "ingredientId": "sambal-oelek",
          "amount": 1,
          "unit": "tbsp"
        },
        {
          "ingredientId": "butter",
          "amount": 1,
          "unit": "oz",
          "note": "finish"
        }
      ]
    },
    {
      "name": "Sides",
      "lines": [
        {
          "ingredientId": "rice-cooked",
          "amount": 0.5,
          "unit": "cup",
          "note": "bok choy, carrots optional"
        }
      ]
    }
  ],
  "steak-jam-honey-mustard-sauce": [
    {
      "name": "Main",
      "lines": [
        {
          "ingredientId": "bavette-steak",
          "amount": 10,
          "unit": "oz",
          "note": "two 5 oz steaks"
        }
      ]
    },
    {
      "name": "Sauce",
      "lines": [
        {
          "ingredientId": "jam",
          "amount": 2.5,
          "unit": "tbsp",
          "note": "2–3 tbsp to taste"
        },
        {
          "ingredientId": "creme-fraiche",
          "amount": 2,
          "unit": "tbsp"
        },
        {
          "ingredientId": "garlic",
          "amount": 1,
          "unit": "clove"
        },
        {
          "ingredientId": "chili-flakes",
          "amount": 1,
          "unit": "tsp"
        },
        {
          "ingredientId": "rice-vinegar",
          "amount": 5,
          "unit": "tsp",
          "note": "rice wine vinegar"
        },
        {
          "ingredientId": "dijon-mustard",
          "amount": 2,
          "unit": "tsp"
        },
        {
          "ingredientId": "lemon-juice",
          "amount": 1,
          "unit": "sqz",
          "note": "1 squeeze"
        }
      ]
    },
    {
      "name": "Side",
      "lines": [
        {
          "ingredientId": "salad-lemon-panko-burrata",
          "amount": null,
          "unit": null
        }
      ]
    }
  ],
  "chicken-katsu-curry": [
    {
      "name": "Main",
      "lines": [
        {
          "ingredientId": "chicken-breast",
          "amount": 8,
          "unit": "oz",
          "note": "butterflied & pounded"
        },
        {
          "ingredientId": "egg",
          "amount": 1,
          "unit": "each",
          "note": "scrambled for breading"
        },
        {
          "ingredientId": "flour-all-purpose",
          "amount": 0.5,
          "unit": "cup"
        },
        {
          "ingredientId": "panko",
          "amount": 1,
          "unit": "cup"
        },
        {
          "ingredientId": "pam-spray",
          "amount": 1,
          "unit": "container"
        }
      ]
    },
    {
      "name": "Sauce",
      "lines": [
        {
          "ingredientId": "curry-cubes",
          "amount": 0.5,
          "unit": "container"
        }
      ]
    },
    {
      "name": "Sides",
      "lines": [
        {
          "ingredientId": "rice-dry",
          "amount": 1,
          "unit": "cup"
        }
      ]
    }
  ],
  "beef-tortilla-melts": [
    {
      "name": "Main",
      "lines": [
        {
          "ingredientId": "ground-beef",
          "amount": 10,
          "unit": "oz"
        },
        {
          "ingredientId": "flour-tortilla",
          "amount": 2,
          "unit": "each"
        },
        {
          "ingredientId": "beef-stock-concentrate",
          "amount": 1,
          "unit": "pouch",
          "note": "10g"
        },
        {
          "ingredientId": "poblano-pepper",
          "amount": 1,
          "unit": "each"
        },
        {
          "ingredientId": "cheddar-cheese",
          "amount": 0.5,
          "unit": "cup"
        },
        {
          "ingredientId": "cream-cheese",
          "amount": 4,
          "unit": "tbsp"
        },
        {
          "ingredientId": "sour-cream",
          "amount": 3,
          "unit": "tbsp"
        },
        {
          "ingredientId": "cholula",
          "amount": 2,
          "unit": "tsp"
        },
        {
          "ingredientId": "butter",
          "amount": 1,
          "unit": "tbsp"
        }
      ]
    }
  ],
  "chili": [
    {
      "name": "Ingredients",
      "lines": [
        {
          "ingredientId": "ground-turkey-93",
          "amount": 20,
          "unit": "oz"
        },
        {
          "ingredientId": "scallions",
          "amount": 1,
          "unit": "bunch"
        },
        {
          "ingredientId": "chili-seasoning",
          "amount": 4,
          "unit": "tbsp"
        },
        {
          "ingredientId": "tomato-paste",
          "amount": 4,
          "unit": "tbsp"
        },
        {
          "ingredientId": "black-beans",
          "amount": 2,
          "unit": "box"
        },
        {
          "ingredientId": "jalapeno",
          "amount": 2,
          "unit": "peppers"
        },
        {
          "ingredientId": "chicken-stock-concentrate",
          "amount": 4,
          "unit": "pouch"
        },
        {
          "ingredientId": "sour-cream",
          "amount": 6,
          "unit": "tbsp"
        },
        {
          "ingredientId": "lime",
          "amount": 1,
          "unit": "each"
        }
      ]
    },
    {
      "name": "Side",
      "lines": [
        {
          "ingredientId": "garlic-bread",
          "amount": 1,
          "unit": "each"
        }
      ]
    }
  ],
  "tortellini-tomato-soup": [
    {
      "name": "Main",
      "lines": [
        {
          "ingredientId": "prepackaged-tortellini",
          "amount": 1,
          "unit": "container"
        }
      ]
    },
    {
      "name": "Sauce",
      "lines": [
        {
          "ingredientId": "saffeway-tomato-soup",
          "amount": 1,
          "unit": "container"
        }
      ]
    }
  ],
  "quesadilla-leftovers": [
    {
      "name": "Main",
      "lines": [
        {
          "ingredientId": "tortilla-flour-small",
          "amount": 2,
          "unit": "each"
        },
        {
          "ingredientId": "cheese-generic",
          "amount": 2,
          "unit": "cup"
        },
        {
          "ingredientId": "leftovers-meat",
          "amount": 1,
          "unit": "each"
        }
      ]
    },
    {
      "name": "Sauce / toppings",
      "lines": [
        {
          "ingredientId": "cholula",
          "amount": null,
          "unit": null,
          "note": "hot sauce, red pepper, cayenne"
        }
      ]
    }
  ],
  "air-fry-asparagus": [
    {
      "name": "Main",
      "lines": [
        {
          "ingredientId": "asparagus",
          "amount": 1,
          "unit": "bunch"
        },
        {
          "ingredientId": "olive-oil",
          "amount": null,
          "unit": null,
          "note": "to toss"
        },
        {
          "ingredientId": "salt-and-pepper",
          "amount": null,
          "unit": null
        }
      ]
    }
  ],
  "air-fry-brussels-sprouts": [
    {
      "name": "Main",
      "lines": [
        {
          "ingredientId": "brussels-sprouts",
          "amount": 12,
          "unit": "oz",
          "note": "trimmed, halved"
        },
        {
          "ingredientId": "olive-oil",
          "amount": null,
          "unit": null,
          "note": "to toss"
        },
        {
          "ingredientId": "salt-and-pepper",
          "amount": null,
          "unit": null
        }
      ]
    }
  ],
  "air-fry-broccoli": [
    {
      "name": "Main",
      "lines": [
        {
          "ingredientId": "broccoli",
          "amount": 1,
          "unit": "each",
          "note": "head, florets"
        },
        {
          "ingredientId": "olive-oil",
          "amount": null,
          "unit": null,
          "note": "to toss"
        },
        {
          "ingredientId": "salt-and-pepper",
          "amount": null,
          "unit": null
        }
      ]
    }
  ],
  "air-fry-squash": [
    {
      "name": "Main",
      "lines": [
        {
          "ingredientId": "squash",
          "amount": 1,
          "unit": "each",
          "note": "medium, cut up"
        },
        {
          "ingredientId": "olive-oil",
          "amount": null,
          "unit": null,
          "note": "to toss"
        },
        {
          "ingredientId": "salt-and-pepper",
          "amount": null,
          "unit": null
        }
      ]
    }
  ],
  "air-fry-potatoes": [
    {
      "name": "Main",
      "lines": [
        {
          "ingredientId": "potato",
          "amount": 12,
          "unit": "oz",
          "note": "bite-size pieces"
        },
        {
          "ingredientId": "olive-oil",
          "amount": null,
          "unit": null,
          "note": "to toss"
        },
        {
          "ingredientId": "salt-and-pepper",
          "amount": null,
          "unit": null
        },
        {
          "ingredientId": "italian-seasoning",
          "amount": null,
          "unit": null,
          "note": "optional"
        }
      ]
    }
  ],
  "air-fry-zucchini-chips": [
    {
      "name": "Main",
      "lines": [
        {
          "ingredientId": "zucchini",
          "amount": 1,
          "unit": "each",
          "note": "thin chips"
        },
        {
          "ingredientId": "olive-oil",
          "amount": null,
          "unit": null,
          "note": "to toss"
        },
        {
          "ingredientId": "salt-and-pepper",
          "amount": null,
          "unit": null
        },
        {
          "ingredientId": "parmesan-cheese",
          "amount": 2,
          "unit": "tbsp",
          "note": "grated"
        },
        {
          "ingredientId": "panko",
          "amount": null,
          "unit": null,
          "note": "optional, non-keto"
        }
      ]
    }
  ],
  "saute-spinach": [
    {
      "name": "Main",
      "lines": [
        {
          "ingredientId": "spinach",
          "amount": 5,
          "unit": "oz"
        },
        {
          "ingredientId": "olive-oil",
          "amount": null,
          "unit": null,
          "note": "for pan"
        },
        {
          "ingredientId": "salt-and-pepper",
          "amount": null,
          "unit": null
        }
      ]
    }
  ],
  "regular-rice": [],
  "fried-rice": [
    {
      "name": "Main",
      "lines": [
        {
          "ingredientId": "rice-cooked",
          "amount": 0.5,
          "unit": "cup"
        },
        {
          "ingredientId": "carrots",
          "amount": 1,
          "unit": "pack"
        },
        {
          "ingredientId": "poblano-pepper",
          "amount": 1,
          "unit": "each",
          "note": "optional"
        },
        {
          "ingredientId": "egg",
          "amount": 1,
          "unit": "each"
        },
        {
          "ingredientId": "scallion",
          "amount": 2,
          "unit": "each"
        },
        {
          "ingredientId": "soy-sauce",
          "amount": 1,
          "unit": "tbsp"
        }
      ]
    }
  ],
  "garlic-bread": [
    {
      "name": "Main",
      "lines": [
        {
          "ingredientId": "bread-roll",
          "amount": 1,
          "unit": "each"
        },
        {
          "ingredientId": "garlic-butter",
          "amount": 4,
          "unit": "tbsp"
        },
        {
          "ingredientId": "parmesan-cheese",
          "amount": null,
          "unit": null,
          "note": "to top"
        }
      ]
    }
  ],
  "mashed-potatoes": [
    {
      "name": "Main",
      "lines": [
        {
          "ingredientId": "potato",
          "amount": 12,
          "unit": "oz"
        },
        {
          "ingredientId": "sour-cream",
          "amount": 1.5,
          "unit": "tbsp"
        },
        {
          "ingredientId": "butter",
          "amount": 2,
          "unit": "tbsp"
        }
      ]
    }
  ],
  "sliced-potatoes": [
    {
      "name": "Main",
      "lines": [
        {
          "ingredientId": "potato",
          "amount": 0.75,
          "unit": "lb",
          "note": "slice or dice"
        },
        {
          "ingredientId": "olive-oil",
          "amount": null,
          "unit": null,
          "note": "to coat"
        },
        {
          "ingredientId": "salt-and-pepper",
          "amount": null,
          "unit": null
        }
      ]
    }
  ],
  "lemon-panko-burrata-salad": [
    {
      "name": "Ingredients",
      "lines": [
        {
          "ingredientId": "arugula",
          "amount": 4,
          "unit": "oz"
        },
        {
          "ingredientId": "panko",
          "amount": 0.25,
          "unit": "cup"
        },
        {
          "ingredientId": "garlic",
          "amount": 1,
          "unit": "clove"
        },
        {
          "ingredientId": "burrata",
          "amount": 4,
          "unit": "oz"
        },
        {
          "ingredientId": "lemon",
          "amount": 1,
          "unit": "each"
        },
        {
          "ingredientId": "olive-oil",
          "amount": 1,
          "unit": "tbsp",
          "note": "drizzle"
        }
      ]
    }
  ],
  "lemon-spaghetti": [
    {
      "name": "Side",
      "lines": [
        {
          "ingredientId": "zucchini",
          "amount": 1,
          "unit": "each"
        },
        {
          "ingredientId": "lemon",
          "amount": 1,
          "unit": "each"
        },
        {
          "ingredientId": "chili-flakes",
          "amount": 1,
          "unit": "tsp"
        },
        {
          "ingredientId": "sour-cream",
          "amount": 1.5,
          "unit": "tsp"
        },
        {
          "ingredientId": "chicken-stock-concentrate",
          "amount": 1,
          "unit": "pouch"
        },
        {
          "ingredientId": "parmesan-cheese",
          "amount": 3,
          "unit": "tbsp"
        },
        {
          "ingredientId": "spaghetti",
          "amount": 6,
          "unit": "oz"
        },
        {
          "ingredientId": "garlic",
          "amount": 1,
          "unit": "clove"
        },
        {
          "ingredientId": "butter",
          "amount": 1,
          "unit": "tbsp"
        }
      ]
    }
  ]
};
