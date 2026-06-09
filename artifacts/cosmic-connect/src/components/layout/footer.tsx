import { Link } from "wouter";

export default function Footer() {
  return (
    <footer className="bg-[#0A0F2C] text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-full bg-[#0057FF] flex items-center justify-center">
                <span className="text-white text-xs font-bold">T</span>
              </div>
              <span className="font-semibold text-lg tracking-tight">Thealins</span>
            </div>
            <p className="text-gray-400 text-sm leading-relaxed max-w-xs">
              Humanity's first open interstellar communication and civilization
              discovery platform. Built by the people, for the species.
            </p>
            <div className="mt-4">
              <span className="inline-flex items-center gap-1.5 text-xs text-gray-500 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 signal-pulse inline-block"></span>
                System operational
              </span>
            </div>
          </div>

          {/* Platform */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
              Platform
            </h3>
            <ul className="space-y-2">
              {[
                { href: "/observatory", label: "Signal Observatory" },
                { href: "/universe", label: "Universe Explorer" },
                { href: "/encode", label: "Encode and Send" },
                { href: "/about", label: "About Thealins" },
              ].map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Science */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
              Science
            </h3>
            <ul className="space-y-2">
              {[
                { label: "Radio Signal Detection" },
                { label: "Technosignatures" },
                { label: "Arecibo Encoding" },
                { label: "Fermi Paradox" },
                { label: "Drake Equation" },
              ].map((item) => (
                <li key={item.label}>
                  <span className="text-sm text-gray-500">{item.label}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-8 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-gray-500">
            © 2025 Thealins. Always free. Always open.
          </p>
          <p className="text-xs text-gray-600 font-mono">
            Listening to the cosmos since 2025
          </p>
        </div>
      </div>
    </footer>
  );
}
