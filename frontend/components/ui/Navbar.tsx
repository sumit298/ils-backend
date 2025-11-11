import { useState } from "react";
import { Search, Bell, User } from "lucide-react";
import { Button } from "./button";
import Link from "next/link";
import { Input } from "./input";
import { CreateStreamDialog } from "../CreateStreamDialog";

export const Navbar = () => {
  const [isCreateStreamOpen, setIsCreateStreamOpen] = useState(false);

  return (
    <nav className="bg-background border-b border-border sticky top-0 z-50 backdrop-blur-sm bg-background/95">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link href="/dashboard" className="flex items-center">
            <div className="text-2xl font-bold bg-gradient-to-r from-accent-purple to-accent-pink bg-clip-text text-transparent">
              StreamHub
            </div>
          </Link>

          {/* Search */}
          <div className="flex-1 max-w-lg mx-8 hidden md:block">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
              <Input
                type="text"
                placeholder="Search streams..."
                className="w-full pl-10 bg-surface border-border focus:ring-2 focus:ring-primary focus:border-transparent rounded-lg"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center space-x-4">
            <Button 
              variant="default" 
              className="font-semibold"
              onClick={() => setIsCreateStreamOpen(true)}
            >
              Go Live
            </Button>
            <button className="p-2 hover:bg-surface rounded-lg transition-colors">
              <Bell className="h-5 w-5 text-text-secondary" />
            </button>
            <Link
              href="/profile"
              className="w-9 h-9 bg-gradient-to-br from-accent-purple to-accent-pink rounded-full flex items-center justify-center text-white hover:shadow-md transition-shadow"
            >
              <User className="h-5 w-5" />
            </Link>
          </div>
        </div>
      </div>
      <CreateStreamDialog open={isCreateStreamOpen} onOpenChange={setIsCreateStreamOpen} />
    </nav>
  );
};