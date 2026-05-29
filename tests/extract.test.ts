import { describe, expect, it } from "vitest";

import { parseCartItemsFromText, parseOrdersFromText, parseProductCard } from "../src/automation/extract.js";

describe("Zepto page extraction helpers", () => {
  it("parses product cards from Zepto-style text", () => {
    const product = parseProductCard(
      {
        automationId: 3,
        imageAlt: "Image: Amul Taaza Toned Milk",
        text: "ADD\n₹32₹34\n₹2 OFF\nAmul Taaza Toned Milk\n1 pack (500 ml)\n4.8(10.5k)"
      },
      0
    );

    expect(product).toEqual({
      index: 0,
      automationId: 3,
      name: "Amul Taaza Toned Milk",
      price: "₹32",
      mrp: "₹34",
      unit: "1 pack (500 ml)",
      rating: "4.8(10.5k)",
      url: undefined
    });
  });

  it("does not invent an automation id for image-only product cards", () => {
    const product = parseProductCard(
      {
        imageAlt: "Image: Tender Coconut",
        text: "Tender Coconut\n1 piece\n₹65"
      },
      0
    );

    expect(product).toEqual({
      index: 0,
      automationId: undefined,
      name: "Tender Coconut",
      price: "₹65",
      mrp: undefined,
      unit: "1 piece",
      rating: undefined,
      url: undefined
    });
  });

  it("ignores image-only navigation cards without product details", () => {
    expect(
      parseProductCard(
        {
          imageAlt: "Image: Popular Searches",
          text: "Popular Searches\nMilk\nFruits & Vegetables"
        },
        0
      )
    ).toBeUndefined();
  });

  it("falls back to visible text when image alt text is generic", () => {
    const product = parseProductCard(
      {
        imageAlt: "Image: Product image",
        text: "ADD\n₹65\nTender Coconut\n1 piece"
      },
      0
    );

    expect(product).toEqual({
      index: 0,
      automationId: undefined,
      name: "Tender Coconut",
      price: "₹65",
      mrp: undefined,
      unit: "1 piece",
      rating: undefined,
      url: undefined
    });
  });

  it("ignores navigation image alt text when visible product details are available", () => {
    const product = parseProductCard(
      {
        automationId: 10,
        imageAlt: "Image: Popular Searches",
        text: "ADD\n₹65\nTender Coconut\n1 piece"
      },
      0
    );

    expect(product).toEqual({
      index: 0,
      automationId: 10,
      name: "Tender Coconut",
      price: "₹65",
      mrp: undefined,
      unit: "1 piece",
      rating: undefined,
      url: undefined
    });
  });

  it("ignores generic Zepto image alt text before visible product text", () => {
    const product = parseProductCard(
      {
        automationId: 8,
        imageAlt: "Zepto",
        text: "ADD\n₹78\nWhole Farm Eggs\n6 pieces"
      },
      0
    );

    expect(product).toMatchObject({
      index: 0,
      automationId: 8,
      name: "Whole Farm Eggs",
      price: "₹78",
      unit: "6 pieces"
    });
  });

  it("ignores delivery and promo image alt text before visible product text", () => {
    expect(
      parseProductCard(
        {
          automationId: 15,
          imageAlt: "Image: 10 MINS",
          text: "ADD\n₹32\nAmul Taaza Toned Milk\n1 pack (500 ml)"
        },
        0
      )
    ).toMatchObject({
      index: 0,
      automationId: 15,
      name: "Amul Taaza Toned Milk",
      price: "₹32",
      unit: "1 pack (500 ml)"
    });

    expect(
      parseProductCard(
        {
          automationId: 16,
          imageAlt: "Image: Super Saver",
          text: "ADD\n₹120\nProtein Bar\n50 g"
        },
        0
      )
    ).toMatchObject({
      index: 0,
      automationId: 16,
      name: "Protein Bar",
      price: "₹120",
      unit: "50 g"
    });
  });

  it("normalizes common rupee text variants in product cards", () => {
    const product = parseProductCard(
      {
        automationId: 5,
        text: "ADD\nRs. 32\nMRP INR 34\nAmul Taaza Toned Milk\n1 pack (500 ml)"
      },
      0
    );

    expect(product).toMatchObject({
      index: 0,
      automationId: 5,
      name: "Amul Taaza Toned Milk",
      price: "₹32",
      mrp: "₹34",
      unit: "1 pack (500 ml)"
    });
  });

  it("does not invert selling price and mrp when mrp appears first", () => {
    const product = parseProductCard(
      {
        automationId: 6,
        text: "ADD\nMRP Rs. 34\nRs. 32\nAmul Taaza Toned Milk\n1 pack (500 ml)"
      },
      0
    );

    expect(product).toMatchObject({
      index: 0,
      automationId: 6,
      name: "Amul Taaza Toned Milk",
      price: "₹32",
      mrp: "₹34",
      unit: "1 pack (500 ml)"
    });
  });

  it("ignores merchandising badges when choosing product names", () => {
    const product = parseProductCard(
      {
        automationId: 4,
        text: "Sponsored\nBest Seller\nADD\nWhole Farm Eggs\n6 pieces\n₹78"
      },
      0
    );

    expect(product).toMatchObject({
      index: 0,
      automationId: 4,
      name: "Whole Farm Eggs",
      price: "₹78",
      unit: "6 pieces"
    });
  });

  it("ignores delivery-speed and promo badges when choosing product names", () => {
    expect(
      parseProductCard(
        {
          automationId: 13,
          text: "10 MINS\nSuper Saver\nADD\nAmul Taaza Toned Milk\n1 pack (500 ml)\n₹32"
        },
        0
      )
    ).toMatchObject({
      index: 0,
      automationId: 13,
      name: "Amul Taaza Toned Milk",
      price: "₹32",
      unit: "1 pack (500 ml)"
    });

    expect(
      parseProductCard(
        {
          automationId: 14,
          text: "Delivery in 8 minutes\nLowest Price\nADD\nWhole Farm Eggs\n6 pieces\n₹78"
        },
        0
      )
    ).toMatchObject({
      index: 0,
      automationId: 14,
      name: "Whole Farm Eggs",
      price: "₹78",
      unit: "6 pieces"
    });
  });

  it("does not treat discount-only product badges as selling prices", () => {
    const product = parseProductCard(
      {
        automationId: 11,
        text: "ADD\n₹25 OFF\n₹120₹145\nProtein Bar\n50 g"
      },
      0
    );

    expect(product).toMatchObject({
      name: "Protein Bar",
      price: "₹120",
      mrp: "₹145",
      unit: "50 g"
    });
  });

  it("keeps product units when only discount pricing is visible", () => {
    const product = parseProductCard(
      {
        automationId: 12,
        text: "ADD\n₹25 OFF\nProtein Bar\n50 g"
      },
      0
    );

    expect(product).toMatchObject({
      name: "Protein Bar",
      price: undefined,
      unit: "50 g"
    });
  });

  it("ignores product section headers when choosing product names", () => {
    const product = parseProductCard(
      {
        automationId: 9,
        imageAlt: "Product image",
        text: "You may also like\nADD\nProtein Bar\n50 g\n₹120"
      },
      0
    );

    expect(product).toMatchObject({
      index: 0,
      automationId: 9,
      name: "Protein Bar",
      price: "₹120",
      unit: "50 g"
    });
  });

  it("parses common grocery unit variants", () => {
    expect(
      parseProductCard(
        {
          text: "ADD\n₹120\nAlmonds\n250 grams"
        },
        0
      )
    ).toMatchObject({
      name: "Almonds",
      unit: "250 grams"
    });

    expect(
      parseProductCard(
        {
          text: "ADD\n₹95\nCold Coffee\n1 bottle"
        },
        0
      )
    ).toMatchObject({
      name: "Cold Coffee",
      unit: "1 bottle"
    });

    expect(
      parseProductCard(
        {
          text: "ADD\n₹180\nBanana\n1 dozen"
        },
        0
      )
    ).toMatchObject({
      name: "Banana",
      unit: "1 dozen"
    });
  });

  it("does not treat collapsed whole-card text as a product unit", () => {
    const product = parseProductCard(
      {
        imageAlt: "Image: Daily Good Sona Masoori Raw Rice",
        text: "ADD₹69₹100₹31OFFDaily Good Sona Masoori Raw Rice1 pack (1 kg)4.6(21.6k)"
      },
      0
    );

    expect(product).toMatchObject({
      name: "Daily Good Sona Masoori Raw Rice",
      price: "₹69",
      mrp: "₹100",
      unit: undefined
    });
  });

  it("parses cart-like text without creating empty items", () => {
    const items = parseCartItemsFromText(`
      Cart
      Amul Taaza Toned Milk
      1 pack (500 ml)
      ₹32
      Qty 1
      Grand Total ₹32
    `);

    expect(items).toEqual([
      {
        name: "Amul Taaza Toned Milk",
        price: "₹32",
        unit: "1 pack (500 ml)",
        quantity: "1"
      }
    ]);
  });

  it("normalizes common rupee text variants in cart items", () => {
    const items = parseCartItemsFromText(`
      Cart
      Amul Taaza Toned Milk
      1 pack (500 ml)
      Rs 32
      Qty 1
      Grand Total INR 32
    `);

    expect(items).toEqual([
      {
        name: "Amul Taaza Toned Milk",
        price: "₹32",
        unit: "1 pack (500 ml)",
        quantity: "1"
      }
    ]);
  });

  it("parses common cart quantity variants", () => {
    expect(
      parseCartItemsFromText(`
        Cart
        Whole Farm Eggs
        6 pieces
        ₹78
        Qty: 2
        Item total ₹156
      `)
    ).toEqual([
      {
        name: "Whole Farm Eggs",
        price: "₹78",
        unit: "6 pieces",
        quantity: "2"
      }
    ]);

    expect(
      parseCartItemsFromText(`
        Cart
        Protein Bar
        50 g
        ₹120
        x 3
        To Pay ₹360
      `)
    ).toEqual([
      {
        name: "Protein Bar",
        price: "₹120",
        unit: "50 g",
        quantity: "3"
      }
    ]);

    expect(
      parseCartItemsFromText(`
        Cart
        Amul Taaza Toned Milk
        1 pack (500 ml)
        ₹32
        -
        2
        +
        To Pay ₹64
      `)
    ).toEqual([
      {
        name: "Amul Taaza Toned Milk",
        price: "₹32",
        unit: "1 pack (500 ml)",
        quantity: "2"
      }
    ]);
  });

  it("does not parse item-count summary text as a cart product", () => {
    expect(
      parseCartItemsFromText(`
        Cart
        2 items
        View Bill
        To Pay ₹110
      `)
    ).toEqual([]);
  });

  it("does not treat bare numbers as cart quantities without stepper context", () => {
    expect(
      parseCartItemsFromText(`
        Cart
        Protein Bar
        50 g
        ₹120
        2
        To Pay ₹120
      `)
    ).toEqual([
      {
        name: "Protein Bar",
        price: "₹120",
        unit: "50 g",
        quantity: undefined
      }
    ]);
  });

  it("does not parse cart fee rows as products", () => {
    const items = parseCartItemsFromText(`
      Cart
      Delivery fee
      ₹25
      Handling charge
      ₹5
      Platform fee
      ₹2
      Grand Total ₹32
    `);

    expect(items).toEqual([]);
  });

  it("does not treat discount-only cart badges as item prices", () => {
    const items = parseCartItemsFromText(`
      Cart
      Protein Bar
      50 g
      ₹20 OFF
      ₹120
      Qty 1
      Grand Total ₹120
    `);

    expect(items).toEqual([
      {
        name: "Protein Bar",
        price: "₹120",
        unit: "50 g",
        quantity: "1"
      }
    ]);
  });

  it("does not borrow fee prices for products without readable item details", () => {
    const items = parseCartItemsFromText(`
      Cart
      Amul Taaza Toned Milk
      Delivery fee
      ₹25
      Grand Total ₹25
    `);

    expect(items).toEqual([]);
  });

  it("does not parse delivery address rows as cart products", () => {
    const items = parseCartItemsFromText(`
      Cart
      Delivery Address
      Home
      221B Baker Street
      Bengaluru 560001
      Amul Taaza Toned Milk
      1 pack (500 ml)
      ₹32
      Qty 1
      Grand Total ₹32
    `);

    expect(items).toEqual([
      {
        name: "Amul Taaza Toned Milk",
        price: "₹32",
        unit: "1 pack (500 ml)",
        quantity: "1"
      }
    ]);
  });

  it("does not parse suggested products on cart pages as cart items", () => {
    const items = parseCartItemsFromText(`
      Cart
      Amul Taaza Toned Milk
      1 pack (500 ml)
      ₹32
      Qty 1
      You may also like
      Protein Bar
      50 g
      ₹120
      ADD
      Similar products
      Tender Coconut
      1 piece
      ₹65
      ADD
      Grand Total ₹32
    `);

    expect(items).toEqual([
      {
        name: "Amul Taaza Toned Milk",
        price: "₹32",
        unit: "1 pack (500 ml)",
        quantity: "1"
      }
    ]);
  });

  it("keeps product item details before bill summary rows", () => {
    const items = parseCartItemsFromText(`
      Cart
      Amul Taaza Toned Milk
      1 pack (500 ml)
      ₹32
      Delivery fee
      ₹25
      Grand Total ₹57
    `);

    expect(items).toEqual([
      {
        name: "Amul Taaza Toned Milk",
        price: "₹32",
        unit: "1 pack (500 ml)",
        quantity: undefined
      }
    ]);
  });

  it("parses order status text", () => {
    const orders = parseOrdersFromText("Order #ZEP1234 Confirmed ETA: 8 mins Total ₹249");

    expect(orders).toEqual([
      {
        id: "ZEP1234",
        status: "Confirmed",
        eta: "8 mins",
        total: "₹249",
        rawText: "Order #ZEP1234 Confirmed ETA: 8 mins Total ₹249"
      }
    ]);
  });

  it("parses order status without an id only when order context is visible", () => {
    const orders = parseOrdersFromText("Track order Out for delivery ETA: 8 mins Total ₹249");

    expect(orders).toEqual([
      {
        id: undefined,
        status: "Out for delivery",
        eta: "8 mins",
        total: "₹249",
        rawText: "Track order Out for delivery ETA: 8 mins Total ₹249"
      }
    ]);
  });

  it("normalizes common rupee text variants in orders", () => {
    const orders = parseOrdersFromText("Order #ZEP1234 Confirmed ETA: 8 mins Total Rs. 249");

    expect(orders).toEqual([
      {
        id: "ZEP1234",
        status: "Confirmed",
        eta: "8 mins",
        total: "₹249",
        rawText: "Order #ZEP1234 Confirmed ETA: 8 mins Total Rs. 249"
      }
    ]);
  });

  it("parses in-progress order status variants", () => {
    const orders = parseOrdersFromText("Order #ZEP5678 On the way ETA: 4 mins Total ₹180");

    expect(orders).toEqual([
      {
        id: "ZEP5678",
        status: "On the way",
        eta: "4 mins",
        total: "₹180",
        rawText: "Order #ZEP5678 On the way ETA: 4 mins Total ₹180"
      }
    ]);
  });

  it("parses arriving-in ETA text for active orders", () => {
    const orders = parseOrdersFromText("Track order Arriving in 8 mins Total ₹249");

    expect(orders).toEqual([
      {
        id: undefined,
        status: "Arriving",
        eta: "8 mins",
        total: "₹249",
        rawText: "Track order Arriving in 8 mins Total ₹249"
      }
    ]);
  });

  it("parses tracking timeline text without requiring an order id", () => {
    const orders = parseOrdersFromText("Track order Confirmed Packed Out for delivery ETA: 8 mins Total ₹249");

    expect(orders).toEqual([
      {
        id: undefined,
        status: "Out for delivery",
        eta: "8 mins",
        total: "₹249",
        rawText: "Track order Confirmed Packed Out for delivery ETA: 8 mins Total ₹249"
      }
    ]);
  });

  it("parses delivery-in ETA text for active orders", () => {
    const orders = parseOrdersFromText("Order #ZEP9999 Out for delivery Delivery in 6 mins Total ₹320");

    expect(orders).toEqual([
      {
        id: "ZEP9999",
        status: "Out for delivery",
        eta: "6 mins",
        total: "₹320",
        rawText: "Order #ZEP9999 Out for delivery Delivery in 6 mins Total ₹320"
      }
    ]);
  });

  it("does not include trailing order action labels in ETA text", () => {
    expect(parseOrdersFromText("Track order Out for delivery ETA: 8 mins Reorder Total ₹249")).toEqual([
      {
        id: undefined,
        status: "Out for delivery",
        eta: "8 mins",
        total: "₹249",
        rawText: "Track order Out for delivery ETA: 8 mins Reorder Total ₹249"
      }
    ]);

    expect(parseOrdersFromText("Track order Out for delivery ETA: Reorder Total ₹249")).toEqual([
      {
        id: undefined,
        status: "Out for delivery",
        eta: undefined,
        total: "₹249",
        rawText: "Track order Out for delivery ETA: Reorder Total ₹249"
      }
    ]);
  });

  it("extracts order totals only from explicit total labels", () => {
    expect(parseOrdersFromText("Order #ZEP1234 Delivered Milk ₹32 Delivery fee ₹25")).toEqual([
      {
        id: "ZEP1234",
        status: "Delivered",
        eta: undefined,
        total: undefined,
        rawText: "Order #ZEP1234 Delivered Milk ₹32 Delivery fee ₹25"
      }
    ]);

    expect(parseOrdersFromText("Order #ZEP1234 Delivered Total savings ₹25")).toEqual([
      {
        id: "ZEP1234",
        status: "Delivered",
        eta: undefined,
        total: undefined,
        rawText: "Order #ZEP1234 Delivered Total savings ₹25"
      }
    ]);

    expect(parseOrdersFromText("Order #ZEP1234 Delivered Total Protein Bar ₹120")).toEqual([
      {
        id: "ZEP1234",
        status: "Delivered",
        eta: undefined,
        total: undefined,
        rawText: "Order #ZEP1234 Delivered Total Protein Bar ₹120"
      }
    ]);

    expect(parseOrdersFromText("Order #ZEP1234 Delivered Item total ₹32 Delivery fee ₹25 Total ₹57")).toEqual([
      {
        id: "ZEP1234",
        status: "Delivered",
        eta: undefined,
        total: "₹57",
        rawText: "Order #ZEP1234 Delivered Item total ₹32 Delivery fee ₹25 Total ₹57"
      }
    ]);

    expect(parseOrdersFromText("Order #ZEP1234 Delivered Total\n₹57")).toEqual([
      {
        id: "ZEP1234",
        status: "Delivered",
        eta: undefined,
        total: "₹57",
        rawText: "Order #ZEP1234 Delivered Total ₹57"
      }
    ]);
  });

  it("does not parse generic delivery copy as an order", () => {
    expect(parseOrdersFromText("Groceries delivered in minutes ETA: 8 mins Total ₹249")).toEqual([]);
  });

  it("does not parse order-marketing copy as an order", () => {
    expect(parseOrdersFromText("Order groceries delivered in minutes ETA: 8 mins Total ₹249")).toEqual([]);
    expect(parseOrdersFromText("Order fresh milk and get it delivered in 8 mins Total ₹249")).toEqual([]);
    expect(parseOrdersFromText("My Orders No orders yet Groceries delivered in minutes")).toEqual([]);
    expect(parseOrdersFromText("Past Orders No orders yet Get groceries delivered within 10 minutes")).toEqual([]);
  });

  it("does not parse bare order ids without readable order details", () => {
    expect(parseOrdersFromText("Order #ZEP1234")).toEqual([]);
  });

  it("does not parse order ids with only totals as readable orders", () => {
    expect(parseOrdersFromText("Order #ZEP1234 Total ₹249")).toEqual([]);
  });

  it("requires stronger evidence before parsing no-id order-history statuses", () => {
    expect(parseOrdersFromText("My Orders Delivered")).toEqual([]);

    expect(parseOrdersFromText("My Orders Delivered Total ₹249")).toEqual([
      {
        id: undefined,
        status: "Delivered",
        eta: undefined,
        total: "₹249",
        rawText: "My Orders Delivered Total ₹249"
      }
    ]);

    expect(parseOrdersFromText("Track order Out for delivery")).toEqual([
      {
        id: undefined,
        status: "Out for delivery",
        eta: undefined,
        total: undefined,
        rawText: "Track order Out for delivery"
      }
    ]);
  });
});
