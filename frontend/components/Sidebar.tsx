import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Compass, User, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: Home },
  { name: "Browse", href: "/browse", icon: Compass },
  { name: "Trending", href: "/browse", icon: TrendingUp },
  { name: "Profile", href: "/profile", icon: User },
];

export const Sidebar = () => {
  const location = usePathname();

  return (
    <aside className="hidden lg:block w-64 bg-card border-r border-border p-4">
      <nav className="space-y-1">
        {navigation.map((item) => {
          const isActive = location === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors",
                isActive
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-text-secondary hover:bg-surface hover:text-text-primary"
              )}
            >
              <item.icon className="h-5 w-5" />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-8">
        <h3 className="px-4 text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
          Recommended
        </h3>
        <div className="space-y-2">
          {["Gaming", "Music", "Art", "Talk Shows"].map((category) => (
            <Link
              key={category}
              href="/browse"
              className="flex items-center space-x-3 px-4 py-2 rounded-lg text-text-secondary hover:bg-surface hover:text-text-primary transition-colors"
            >
              <div className="w-2 h-2 rounded-full bg-success" />
              <span className="text-sm">{category}</span>
            </Link>
          ))}
        </div>
      </div>
    </aside>
  );
};
