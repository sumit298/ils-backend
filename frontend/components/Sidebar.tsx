import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Compass, User, TrendingUp, Video, Mic, Bot } from "lucide-react";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: Home },
  { name: "Browse", href: "/browse", icon: Compass },
  { name: "Recordings", href: "/vods", icon: Video },
  { name: "AI Podcasts", href: "/ai-podcast", icon: Mic },
  { name: "AI Streamer", href: "/ai-streamer/create", icon: Bot },
  { name: "Profile", href: "/profile", icon: User },
  { name: "Following", href: "/following", icon: TrendingUp }
];

interface SidebarProps {
  onNavigate?: () => void;
}

export const Sidebar = ({ onNavigate }: SidebarProps = {}) => {
  const location = usePathname();

  return (
    <aside className="w-full lg:w-64 bg-surface lg:border-r border-border p-4 h-full">
      <nav className="space-y-1">
        {navigation.map((item) => {
          const isActive = location === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center space-x-3 px-4 py-3 rounded-lg transition-all duration-200",
                isActive
                  ? "bg-elevated text-text-primary font-semibold border border-primary/20"
                  : "text-text-secondary hover:bg-elevated/60 hover:text-text-primary"
              )}
            >
              <item.icon className={cn("h-5 w-5", isActive && "text-primary")} />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
};
