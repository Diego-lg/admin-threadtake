// Removed TypeScript type import and annotation

const nextConfig = {
  api: {
    bodyParser: {
      sizeLimit: "10mb", // Increase the limit for API routes
    },
  },
  // CORS headers will be handled in middleware.ts
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "pub-167bcbb6797c48d686d7dacfba94f17f.r2.dev", // Your R2 public hostname
        port: "",
        pathname: "/**", // Allow any path on this hostname
      },
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
        port: "",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "placeholder.com", // Added for temporary placeholder URLs
        port: "",
        pathname: "/**",
      },
    ],
  },
  /* config options here */
};

export default nextConfig;
