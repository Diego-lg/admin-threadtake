import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const navigationConfig = {
  logoText: "AWAQAI",
  marketplaceLink: "/marketplace",
  marketplaceLabel: "Marketplace",
  menuItems: [
    { label: "My Designs", href: "/account/designs" },
    { label: "Order History", href: "/account/orders" },
    { label: "Settings", href: "/account/settings" },
    { label: "Profile", href: "/account/profile" },
  ],
  signInButtonText: "Sign In",
  activeLinkStyle: { text: "white", bg: "black", shadow: "shadow-black/25" },
  inactiveLinkStyle: { text: "gray-700", hoverText: "white", hoverBg: "black" },
};

const footerConfig = {
  brandName: "THREAD TAKE",
  brandDescription:
    "Premium essentials crafted with the finest materials for everyday luxury.",
  socialLinks: [
    { platform: "instagram", href: "#", label: "Instagram" },
    { platform: "twitter", href: "#", label: "Twitter" },
    { platform: "facebook", href: "#", label: "Facebook" },
  ],
  sections: {
    SHOP: [
      { label: "All Products", href: "/products" },
      { label: "New Arrivals", href: "/products?sort=new" },
      { label: "Best Sellers", href: "/products?sort=bestselling" },
    ],
    HELP: [
      { label: "FAQ", href: "/faq" },
      { label: "Shipping & Returns", href: "/shipping" },
      { label: "Size Guide", href: "/size-guide" },
      { label: "Contact Us", href: "/contact" },
    ],
    ABOUT: [
      { label: "Our Story", href: "/about" },
      { label: "Sustainability", href: "/sustainability" },
    ],
  },
  copyright: "© {year} THREAD TAKE. All rights reserved.",
};

const themeConfig = {
  light: {
    background: "0 0% 100%",
    foreground: "0 0% 3.9%",
    card: "0 0% 100%",
    cardForeground: "0 0% 3.9%",
    popover: "0 0% 100%",
    popoverForeground: "0 0% 3.9%",
    primary: "0 0% 9%",
    primaryForeground: "0 0% 98%",
    secondary: "0 0% 96.1%",
    secondaryForeground: "0 0% 9%",
    muted: "0 0% 96.1%",
    mutedForeground: "0 0% 45.1%",
    accent: "0 0% 96.1%",
    accentForeground: "0 0% 9%",
    destructive: "0 84.2% 60.2%",
    destructiveForeground: "0 0% 98%",
    border: "0 0% 89.8%",
    input: "0 0% 89.8%",
    ring: "0 0% 3.9%",
  },
  dark: {
    background: "0 0% 3.9%",
    foreground: "0 0% 98%",
    card: "0 0% 3.9%",
    cardForeground: "0 0% 98%",
    popover: "0 0% 3.9%",
    popoverForeground: "0 0% 98%",
    primary: "0 0% 98%",
    primaryForeground: "0 0% 9%",
    secondary: "0 0% 14.9%",
    secondaryForeground: "0 0% 98%",
    muted: "0 0% 14.9%",
    mutedForeground: "0 0% 63.9%",
    accent: "0 0% 14.9%",
    accentForeground: "0 0% 98%",
    destructive: "0 62.8% 30.6%",
    destructiveForeground: "0 0% 98%",
    border: "0 0% 14.9%",
    input: "0 0% 14.9%",
    ring: "0 0% 83.1%",
  },
  themeProvider: {
    defaultTheme: "system",
    enableSystem: true,
    storageKey: "theme",
  },
};

const authConfig = {
  features: [
    { icon: "zap", title: "Instant Design Generation" },
    { icon: "image", title: "Premium Mockup Library" },
    { icon: "headphones", title: "24/7 Creator Support" },
  ],
  googleColors: ["#4285F4", "#34A853", "#FBBC05", "#EA4335"],
  descriptions: {
    register:
      "Join thousands of creators and bring your unique designs to life with our cutting-edge platform.",
    login:
      "Welcome back! Ready to continue your creative journey and explore new design possibilities?",
  },
};

const categoriesConfig = {
  sectionHeading: "Shop by Category",
  shopNowText: "Shop Now",
  placeholderText: "No Image",
};

async function main() {
  console.log("Seeding frontend configuration...");

  // Upsert all configurations
  const configs = [
    { section: "navigation", config: navigationConfig },
    { section: "footer", config: footerConfig },
    { section: "theme", config: themeConfig },
    { section: "auth", config: authConfig },
    { section: "categories", config: categoriesConfig },
  ];

  for (const { section, config } of configs) {
    await prisma.frontendConfig.upsert({
      where: { section },
      update: { config },
      create: { section, config },
    });
    console.log(`✓ Seeded ${section} configuration`);
  }

  console.log("Frontend configuration seeding completed!");
}

main()
  .catch((e) => {
    console.error("Error seeding frontend configuration:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
