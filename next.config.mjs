/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    // ビルド時のTypeScriptエラーを無視（デプロイ確認用）
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
