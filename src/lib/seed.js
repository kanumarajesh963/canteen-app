// Starting catalogue for the canteen counter.
// price = what the customer pays, cost = what it costs the canteen (for profit/loss).
export const seedProducts = [
  { id: "p1", name: "Chocolate Bar", category: "Snacks", emoji: "🍫", price: 20, cost: 12, stock: 10, unit: "pc" },
  { id: "p2", name: "Samosa", category: "Snacks", emoji: "🥟", price: 15, cost: 8, stock: 25, unit: "pc" },
  { id: "p3", name: "Vada Pav", category: "Snacks", emoji: "🍔", price: 25, cost: 14, stock: 18, unit: "pc" },
  { id: "p4", name: "Masala Chai", category: "Beverages", emoji: "☕", price: 10, cost: 4, stock: 40, unit: "cup" },
  { id: "p5", name: "Filter Coffee", category: "Beverages", emoji: "☕", price: 15, cost: 6, stock: 30, unit: "cup" },
  { id: "p6", name: "Cold Drink Can", category: "Beverages", emoji: "🥤", price: 40, cost: 28, stock: 20, unit: "can" },
  { id: "p7", name: "Veg Sandwich", category: "Meals", emoji: "🥪", price: 35, cost: 20, stock: 15, unit: "pc" },
  { id: "p8", name: "Maggi Noodles", category: "Meals", emoji: "🍜", price: 30, cost: 16, stock: 20, unit: "bowl" },
  { id: "p9", name: "Chips Packet", category: "Snacks", emoji: "🍟", price: 20, cost: 13, stock: 22, unit: "pkt" },
  { id: "p10", name: "Biscuit Pack", category: "Snacks", emoji: "🍪", price: 10, cost: 5, stock: 35, unit: "pkt" },
  { id: "p11", name: "Fruit Bowl", category: "Meals", emoji: "🍎", price: 30, cost: 18, stock: 12, unit: "bowl" },
  { id: "p12", name: "Mineral Water", category: "Beverages", emoji: "💧", price: 15, cost: 9, stock: 30, unit: "bottle" },
];

export const paymentApps = [
  { id: "gpay", name: "Google Pay", emoji: "🟢" },
  { id: "phonepe", name: "PhonePe", emoji: "🟣" },
  { id: "paytm", name: "Paytm", emoji: "🔵" },
  { id: "card", name: "Debit / Credit Card", emoji: "💳" },
  { id: "cash", name: "Pay at Counter (Cash)", emoji: "💵" },
];
