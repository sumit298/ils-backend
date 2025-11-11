import { Button } from '@/components/ui/button';
import { Play, Zap, Users, Video, TrendingUp, Shield, MessageCircle, BarChart3, Tv, Sparkles, Radio, Star, ArrowRight} from 'lucide-react'
import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="relative overflow-hidden border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-32">
          <div className="text-center">
            {/* Logo */}
            <div className="mb-8">
              {/* <div className="inline-block mb-4 px-4 py-2 bg-accent-purple/10 border border-accent-purple/20 rounded-full">
                <span className="text-accent-purple font-semibold text-sm">🎉 Now Live - Join thousands of streamers</span>
              </div> */}
              <h1 className="text-5xl md:text-7xl font-bold bg-linear-to-r from-accent-purple to-accent-pink bg-clip-text text-transparent mb-4">
                StreamHub
              </h1>
              <p className="text-xl md:text-2xl text-text-secondary max-w-2xl mx-auto">
                Your platform for live streaming. Connect with audiences, share
                your passion, and build your community.
              </p>
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-4 mb-20">
              <Button
                variant="default"
                size="lg"
                className="text-lg px-6 py-5"
                asChild
              >
                <Link href="/signup">
                  Get Started Free
                  <Play className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button variant="outline" size="lg" className="text-lg px-6 py-5" asChild>
                <Link href="/browse">Explore Streams</Link>
              </Button>
            </div>

            {/* Features */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="bg-card border border-border rounded-2xl p-8 hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
                <div className="w-14 h-14 bg-linear-to-br from-accent-purple to-accent-pink rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Video className="h-7 w-7 text-white" />
                </div>
                <h3 className="text-xl font-bold text-text-primary mb-2">
                  HD Live Streaming
                </h3>
                <p className="text-text-secondary">
                  Stream in high quality with minimal delay. Share your content
                  with the world in crystal clear quality.
                </p>
              </div>

              <div className="bg-card border border-border rounded-2xl p-8 hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
                <div className="w-14 h-14 bg-linear-to-br from-accent-blue to-blue-600 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Users className="h-7 w-7 text-white" />
                </div>
                <h3 className="text-xl font-bold text-text-primary mb-2">
                  Build Community
                </h3>
                <p className="text-text-secondary">
                  Engage with viewers through live chat and build lasting
                  connections with your audience.
                </p>
              </div>

              <div className="bg-card border border-border rounded-2xl p-8 hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
                <div className="w-14 h-14 bg-linear-to-br from-accent-pink to-pink-600 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Zap className="h-7 w-7 text-white" />
                </div>
                <h3 className="text-xl font-bold text-text-primary mb-2">
                  Go Live Instantly
                </h3>
                <p className="text-text-secondary">
                  Start streaming in seconds with our easy-to-use platform. No complex setup required.
                </p>
              </div>
            </div>
          </div>
        </div>

        
      </div>

      {/* How It Works Section */}
      <div className="py-20 md:py-32 bg-surface">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold text-text-primary mb-4">
              How It Works
            </h2>
            <p className="text-lg text-text-secondary max-w-2xl mx-auto">
              Get started with streaming in three simple steps
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-linear-to-br from-accent-purple to-accent-pink rounded-2xl flex items-center justify-center mx-auto mb-6">
                <span className="text-2xl font-bold text-white">1</span>
              </div>
              <h3 className="text-xl font-bold text-text-primary mb-3">Create Account</h3>
              <p className="text-text-secondary">
                Sign up for free and set up your streaming profile in minutes
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-linear-to-br from-accent-blue to-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <span className="text-2xl font-bold text-white">2</span>
              </div>
              <h3 className="text-xl font-bold text-text-primary mb-3">Configure Stream</h3>
              <p className="text-text-secondary">
                Set up your stream settings and customize your channel
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 bg-linear-to-br from-accent-pink to-pink-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <span className="text-2xl font-bold text-white">3</span>
              </div>
              <h3 className="text-xl font-bold text-text-primary mb-3">Go Live</h3>
              <p className="text-text-secondary">
                Start streaming and connect with your audience worldwide
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Advanced Features Grid */}
      <div className="py-20 md:py-32 relative overflow-hidden">
        <div className="absolute inset-0 bg-linear-to-b from-transparent via-accent-purple/5 to-transparent"></div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="text-center mb-16">
            <div className="inline-block mb-4 px-4 py-2 bg-accent-purple/10 border border-accent-purple/20 rounded-full">
              <span className="text-accent-purple font-semibold text-sm">✨ Advanced Tools</span>
            </div>
            <h2 className="text-3xl md:text-5xl font-bold text-text-primary mb-4">
              Everything You Need to Succeed
            </h2>
            <p className="text-lg text-text-secondary max-w-2xl mx-auto">
              Professional streaming tools designed to help you grow and engage your community
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-card border border-border rounded-2xl p-6 hover:shadow-xl hover:border-accent-purple/30 transition-all duration-300 group">
              <div className="w-12 h-12 bg-linear-to-br from-accent-purple to-accent-pink rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <MessageCircle className="h-6 w-6 text-white" />
              </div>
              <h3 className="text-lg font-bold text-text-primary mb-2">Live Chat</h3>
              <p className="text-text-secondary text-sm">
                Engage with your audience in real-time with moderation tools and custom emotes
              </p>
            </div>

            <div className="bg-card border border-border rounded-2xl p-6 hover:shadow-xl hover:border-accent-blue/30 transition-all duration-300 group">
              <div className="w-12 h-12 bg-linear-to-br from-accent-blue to-blue-600 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <BarChart3 className="h-6 w-6 text-white" />
              </div>
              <h3 className="text-lg font-bold text-text-primary mb-2">Analytics</h3>
              <p className="text-text-secondary text-sm">
                Track your growth with detailed insights and viewer engagement metrics
              </p>
            </div>

            <div className="bg-card border border-border rounded-2xl p-6 hover:shadow-xl hover:border-accent-green/30 transition-all duration-300 group">
              <div className="w-12 h-12 bg-linear-to-br from-accent-green to-green-600 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Tv className="h-6 w-6 text-white" />
              </div>
              <h3 className="text-lg font-bold text-text-primary mb-2">Multi-Stream</h3>
              <p className="text-text-secondary text-sm">
                Broadcast to multiple platforms simultaneously and reach more viewers
              </p>
            </div>

            <div className="bg-card border border-border rounded-2xl p-6 hover:shadow-xl hover:border-accent-pink/30 transition-all duration-300 group">
              <div className="w-12 h-12 bg-linear-to-br from-accent-pink to-pink-600 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Sparkles className="h-6 w-6 text-white" />
              </div>
              <h3 className="text-lg font-bold text-text-primary mb-2">Custom Overlays</h3>
              <p className="text-text-secondary text-sm">
                Personalize your stream with custom graphics, alerts, and branding
              </p>
            </div>

            <div className="bg-card border border-border rounded-2xl p-6 hover:shadow-xl hover:border-accent-orange/30 transition-all duration-300 group">
              <div className="w-12 h-12 bg-linear-to-br from-accent-orange to-orange-600 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Radio className="h-6 w-6 text-white" />
              </div>
              <h3 className="text-lg font-bold text-text-primary mb-2">HD Quality</h3>
              <p className="text-text-secondary text-sm">
                Stream in 1080p or 4K with ultra-low latency for the best quality
              </p>
            </div>

            <div className="bg-card border border-border rounded-2xl p-6 hover:shadow-xl hover:border-accent-purple/30 transition-all duration-300 group">
              <div className="w-12 h-12 bg-linear-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Shield className="h-6 w-6 text-white" />
              </div>
              <h3 className="text-lg font-bold text-text-primary mb-2">Security</h3>
              <p className="text-text-secondary text-sm">
                Enterprise-grade security with encryption and privacy controls
              </p>
            </div>

            <div className="bg-card border border-border rounded-2xl p-6 hover:shadow-xl hover:border-accent-blue/30 transition-all duration-300 group">
              <div className="w-12 h-12 bg-linear-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <TrendingUp className="h-6 w-6 text-white" />
              </div>
              <h3 className="text-lg font-bold text-text-primary mb-2">Growth Tools</h3>
              <p className="text-text-secondary text-sm">
                Discover new audiences with recommendations and cross-promotion
              </p>
            </div>

            <div className="bg-card border border-border rounded-2xl p-6 hover:shadow-xl hover:border-accent-pink/30 transition-all duration-300 group">
              <div className="w-12 h-12 bg-linear-to-br from-pink-500 to-pink-600 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Users className="h-6 w-6 text-white" />
              </div>
              <h3 className="text-lg font-bold text-text-primary mb-2">Community</h3>
              <p className="text-text-secondary text-sm">
                Build and manage your community with followers, subscribers, and fans
              </p>
            </div>
          </div>
        </div>
      </div>


      {/* CTA Section */}
      <div className="py-20 md:py-32">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="bg-linear-to-r from-accent-purple to-accent-pink rounded-3xl p-12 md:p-16 text-white">
            <h2 className="text-3xl md:text-5xl font-bold mb-4">
              Ready to Start Streaming?
            </h2>
            <p className="text-lg md:text-xl mb-8 text-white/90">
              Join thousands of streamers and start building your community today
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-4">
              <Button
                variant="secondary"
                size="lg"
                className="text-lg px-8 bg-white text-accent-purple hover:bg-white/90"
                asChild
              >
                <Link href="/signup">
                  Get Started Free
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="text-lg px-8 border-white bg-transparent text-white hover:bg-white/10"
                asChild
              >
                <Link href="/signin">Sign In</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-border bg-surface">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            <div>
              <h3 className="text-xl font-bold bg-linear-to-r from-accent-purple to-accent-pink bg-clip-text text-transparent mb-4">
                StreamHub
              </h3>
              <p className="text-text-secondary text-sm">
                Your platform for live streaming and building communities.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-text-primary mb-4">Product</h4>
              <ul className="space-y-2 text-sm text-text-secondary">
                <li><Link href="/browse" className="hover:text-accent-purple transition-colors">Browse Streams</Link></li>
                <li><Link href="/dashboard" className="hover:text-accent-purple transition-colors">Dashboard</Link></li>
                <li><a href="#" className="hover:text-accent-purple transition-colors">Features</a></li>
                <li><a href="#" className="hover:text-accent-purple transition-colors">Pricing</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-text-primary mb-4">Company</h4>
              <ul className="space-y-2 text-sm text-text-secondary">
                <li><a href="#" className="hover:text-accent-purple transition-colors">About</a></li>
                <li><a href="#" className="hover:text-accent-purple transition-colors">Blog</a></li>
                <li><a href="#" className="hover:text-accent-purple transition-colors">Careers</a></li>
                <li><a href="#" className="hover:text-accent-purple transition-colors">Contact</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-text-primary mb-4">Legal</h4>
              <ul className="space-y-2 text-sm text-text-secondary">
                <li><a href="#" className="hover:text-accent-purple transition-colors">Privacy</a></li>
                <li><a href="#" className="hover:text-accent-purple transition-colors">Terms</a></li>
                <li><a href="#" className="hover:text-accent-purple transition-colors">Guidelines</a></li>
                <li><a href="#" className="hover:text-accent-purple transition-colors">Cookies</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-border pt-8 text-center text-sm text-text-secondary">
            <p>&copy; 2024 StreamHub. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};
