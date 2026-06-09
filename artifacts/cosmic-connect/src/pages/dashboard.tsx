import { useEffect, useState } from "react";
import { Link } from "wouter";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import Footer from "@/components/layout/footer";
import { Radio, Waves, Globe, ChevronRight, User, LogOut } from "lucide-react";

interface UserData {
  displayName: string;
  email: string;
  messagesEncoded: number;
  signalsFlagged: number;
  createdAt: any;
}

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => {
    async function fetchUser() {
      if (!user) return;
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists()) {
          setUserData(snap.data() as UserData);
        }
      } catch (e) {
        // silently continue — show defaults
      } finally {
        setLoadingData(false);
      }
    }
    fetchUser();
  }, [user]);

  const displayName =
    user?.displayName ||
    userData?.displayName ||
    user?.email?.split("@")[0] ||
    "Explorer";

  const firstLetter = displayName.charAt(0).toUpperCase();

  const stats = [
    {
      icon: <Radio className="w-5 h-5 text-[#0057FF]" />,
      label: "Signals Flagged",
      value: userData?.signalsFlagged ?? 0,
      sublabel: "Anomalies you've reported",
    },
    {
      icon: <Waves className="w-5 h-5 text-[#0057FF]" />,
      label: "Messages Encoded",
      value: userData?.messagesEncoded ?? 0,
      sublabel: "Messages sent to the cosmos",
    },
  ];

  const quickLinks = [
    {
      href: "/observatory",
      icon: <Radio className="w-5 h-5 text-[#0057FF]" />,
      title: "Signal Observatory",
      description: "Monitor live radio signals and flag anomalies",
      badge: "Phase 4",
    },
    {
      href: "/universe",
      icon: <Globe className="w-5 h-5 text-[#0057FF]" />,
      title: "Universe Explorer",
      description: "Browse 5,600+ real confirmed exoplanets",
      badge: "Phase 3",
    },
    {
      href: "/encode",
      icon: <Waves className="w-5 h-5 text-[#0057FF]" />,
      title: "Encode and Send",
      description: "Encode your message in Arecibo-style binary",
      badge: "Phase 5",
    },
  ];

  return (
    <main className="pt-16 min-h-screen bg-white flex flex-col">
      <div className="flex-1">
        {/* Header */}
        <section className="bg-white border-b border-gray-100 py-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-[#0057FF] flex items-center justify-center flex-shrink-0">
                  {user?.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={displayName}
                      className="w-12 h-12 rounded-full object-cover"
                    />
                  ) : (
                    <span className="text-white font-bold text-lg">{firstLetter}</span>
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold text-[#0057FF] uppercase tracking-widest mb-0.5">
                    Mission Dashboard
                  </p>
                  <h1 className="text-2xl font-bold text-[#0A0A0A]">
                    Welcome back, {displayName}
                  </h1>
                  <p className="text-sm text-gray-400 mt-0.5">{user?.email}</p>
                </div>
              </div>
              <button
                onClick={logout}
                className="inline-flex items-center gap-2 border border-gray-200 text-gray-600 font-medium px-4 py-2 rounded-md hover:bg-gray-50 hover:text-[#0A0A0A] transition-colors text-sm"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="bg-white py-10 border-b border-gray-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <p className="text-xs font-semibold text-[#0057FF] uppercase tracking-widest mb-6">
              Your contributions
            </p>
            {loadingData ? (
              <div className="grid sm:grid-cols-2 gap-4">
                {[0, 1].map((i) => (
                  <div key={i} className="border border-gray-100 rounded-xl p-6 animate-pulse">
                    <div className="h-4 bg-gray-100 rounded w-24 mb-3"></div>
                    <div className="h-8 bg-gray-100 rounded w-12 mb-2"></div>
                    <div className="h-3 bg-gray-100 rounded w-32"></div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-4">
                {stats.map((stat) => (
                  <div
                    key={stat.label}
                    className="border border-gray-100 rounded-xl p-6 hover:border-blue-100 hover:shadow-sm transition-all"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm text-gray-500 mb-1">{stat.label}</p>
                        <p className="text-4xl font-bold text-[#0A0A0A] font-mono">
                          {stat.value}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">{stat.sublabel}</p>
                      </div>
                      <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                        {stat.icon}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Account Info */}
        <section className="bg-white py-10 border-b border-gray-100">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <p className="text-xs font-semibold text-[#0057FF] uppercase tracking-widest mb-6">
              Account
            </p>
            <div className="border border-gray-100 rounded-xl divide-y divide-gray-50">
              <div className="flex items-center justify-between px-6 py-4">
                <div className="flex items-center gap-3">
                  <User className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-500">Name</span>
                </div>
                <span className="text-sm font-medium text-[#0A0A0A]">{displayName}</span>
              </div>
              <div className="flex items-center justify-between px-6 py-4">
                <div className="flex items-center gap-3">
                  <span className="w-4 h-4 text-gray-400 text-xs flex items-center justify-center">@</span>
                  <span className="text-sm text-gray-500">Email</span>
                </div>
                <span className="text-sm font-medium text-[#0A0A0A]">{user?.email}</span>
              </div>
              <div className="flex items-center justify-between px-6 py-4">
                <div className="flex items-center gap-3">
                  <span className="w-4 h-4 text-gray-400 text-xs flex items-center justify-center font-mono">✓</span>
                  <span className="text-sm text-gray-500">Plan</span>
                </div>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-50 border border-green-100 rounded-full px-2.5 py-0.5">
                  Free Forever
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Quick Links */}
        <section className="bg-white py-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <p className="text-xs font-semibold text-[#0057FF] uppercase tracking-widest mb-6">
              Mission modules
            </p>
            <div className="grid sm:grid-cols-3 gap-4">
              {quickLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="group relative border border-gray-100 rounded-xl p-6 hover:border-blue-100 hover:shadow-md transition-all"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                      {link.icon}
                    </div>
                    <span className="text-xs text-orange-500 font-medium bg-orange-50 border border-orange-100 rounded-full px-2 py-0.5">
                      {link.badge}
                    </span>
                  </div>
                  <h3 className="font-semibold text-[#0A0A0A] mb-1">{link.title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{link.description}</p>
                  <div className="mt-3 flex items-center gap-1 text-xs text-[#0057FF] font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                    Open <ChevronRight className="w-3 h-3" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </div>

      <Footer />
    </main>
  );
}
