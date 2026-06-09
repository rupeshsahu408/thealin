import { Link } from "wouter";
import { Radio, Globe, MessageSquare, ChevronRight, Satellite, Telescope, Waves } from "lucide-react";
import Footer from "@/components/layout/footer";

const stats = [
  { value: "5,600+", label: "Confirmed Exoplanets", sublabel: "Real NASA catalog data" },
  { value: "1,420", label: "MHz Hydrogen Line", sublabel: "Universal signal frequency" },
  { value: "30M+", label: "Ham Radio Operators", sublabel: "Volunteer transmitters worldwide" },
  { value: "100%", label: "Free Forever", sublabel: "No subscriptions, ever" },
];

const steps = [
  {
    number: "01",
    icon: <Radio className="w-6 h-6" />,
    title: "Listen",
    description:
      "Our signal observatory aggregates real radio telescope data from the WebSDR network worldwide. AI scans for non-natural patterns 24/7.",
  },
  {
    number: "02",
    icon: <Telescope className="w-6 h-6" />,
    title: "Discover",
    description:
      "Explore 5,600+ real confirmed exoplanets. We calculate civilization probability using habitable zone position, star type, and atmospheric data.",
  },
  {
    number: "03",
    icon: <Waves className="w-6 h-6" />,
    title: "Communicate",
    description:
      "Encode your message using scientifically accurate prime-number headers and Arecibo-style binary encoding. Transmit via Ham Radio volunteer networks.",
  },
];

const methods = [
  {
    icon: <Radio className="w-5 h-5 text-[#0057FF]" />,
    title: "Radio Signal Detection",
    description:
      "Monitor the 1420 MHz hydrogen line — the universal frequency any intelligent civilization would know to use.",
  },
  {
    icon: <Satellite className="w-5 h-5 text-[#0057FF]" />,
    title: "Technosignature Analysis",
    description:
      "Detect artificial light patterns from mega-structures or energy harvesting around distant stars.",
  },
  {
    icon: <Globe className="w-5 h-5 text-[#0057FF]" />,
    title: "Chemical Signatures",
    description:
      "Identify oxygen + methane combinations in exoplanet atmospheres — the clearest chemical sign of life.",
  },
  {
    icon: <MessageSquare className="w-5 h-5 text-[#0057FF]" />,
    title: "Mathematical Patterns",
    description:
      "Any intelligence will recognize prime numbers and pi. We encode every outgoing signal with these universal constants.",
  },
];

export default function Home() {
  return (
    <main className="pt-16">
      {/* Hero */}
      <section className="relative overflow-hidden bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-24 md:pt-28 md:pb-32">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-full px-3 py-1 mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-[#0057FF] signal-pulse"></span>
              <span className="text-xs font-medium text-[#0057FF] tracking-wide">
                Signal Observatory Active
              </span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-[#0A0A0A] leading-tight tracking-tight">
              Is anyone else
              <br />
              <span className="text-[#0057FF]">out there?</span>
            </h1>

            <p className="mt-6 text-lg text-gray-500 leading-relaxed max-w-xl">
              Thealins is humanity's first open interstellar communication platform.
              Detect real space signals, explore exoplanets, and send encoded messages
              to the cosmos — completely free, scientifically accurate.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/observatory"
                className="inline-flex items-center gap-2 bg-[#0057FF] text-white font-medium px-6 py-3 rounded-md hover:bg-blue-700 transition-colors text-sm"
              >
                Open Observatory
                <ChevronRight className="w-4 h-4" />
              </Link>
              <Link
                href="/universe"
                className="inline-flex items-center gap-2 border border-gray-200 text-[#0A0A0A] font-medium px-6 py-3 rounded-md hover:bg-gray-50 transition-colors text-sm"
              >
                Explore Universe
              </Link>
            </div>
          </div>
        </div>

        {/* Subtle grid background */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "linear-gradient(rgba(0,87,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,87,255,0.03) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
      </section>

      {/* Stats Bar */}
      <section className="bg-[#0A0F2C] border-y border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
            {stats.map((stat) => (
              <div key={stat.value} className="text-center">
                <div className="text-2xl md:text-3xl font-bold text-white font-mono">
                  {stat.value}
                </div>
                <div className="mt-1 text-sm font-medium text-gray-300">{stat.label}</div>
                <div className="mt-0.5 text-xs text-gray-500">{stat.sublabel}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="bg-white py-20 md:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-xl mb-14">
            <p className="text-xs font-semibold text-[#0057FF] uppercase tracking-widest mb-3">
              How it works
            </p>
            <h2 className="text-3xl md:text-4xl font-bold text-[#0A0A0A] leading-tight">
              Three steps toward first contact
            </h2>
            <p className="mt-4 text-gray-500">
              Every tool on Thealins is grounded in real science. No simulations
              disguised as real data. No gimmicks.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {steps.map((step) => (
              <div
                key={step.number}
                className="relative bg-white border border-gray-100 rounded-xl p-6 hover:border-blue-100 hover:shadow-md transition-all"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-[#0057FF]">
                    {step.icon}
                  </div>
                  <span className="text-4xl font-bold text-gray-100 font-mono">
                    {step.number}
                  </span>
                </div>
                <h3 className="text-lg font-semibold text-[#0A0A0A] mb-2">
                  {step.title}
                </h3>
                <p className="text-sm text-gray-500 leading-relaxed">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Detection Methods */}
      <section className="bg-gray-50 py-20 md:py-28 border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-xl mb-14">
            <p className="text-xs font-semibold text-[#0057FF] uppercase tracking-widest mb-3">
              Scientific methods
            </p>
            <h2 className="text-3xl md:text-4xl font-bold text-[#0A0A0A] leading-tight">
              Four ways we search for civilizations
            </h2>
            <p className="mt-4 text-gray-500">
              Thealins uses every scientifically validated method for detecting
              signs of intelligent life beyond Earth.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-6">
            {methods.map((method) => (
              <div
                key={method.title}
                className="bg-white border border-gray-100 rounded-xl p-6 hover:border-blue-100 hover:shadow-sm transition-all"
              >
                <div className="flex items-start gap-4">
                  <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                    {method.icon}
                  </div>
                  <div>
                    <h3 className="font-semibold text-[#0A0A0A] mb-1">{method.title}</h3>
                    <p className="text-sm text-gray-500 leading-relaxed">
                      {method.description}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Mission Statement */}
      <section className="bg-[#0A0F2C] py-20 md:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <p className="text-xs font-semibold text-[#0057FF] uppercase tracking-widest mb-6">
              Our mission
            </p>
            <h2 className="text-3xl md:text-4xl font-bold text-white leading-tight">
              The universe is 13.8 billion years old.
              <br />
              <span className="text-gray-400">We cannot be the only ones asking.</span>
            </h2>
            <p className="mt-6 text-gray-400 leading-relaxed max-w-xl mx-auto">
              Thealins exists because the search for other civilizations should not be
              locked behind government budgets and institutional access. Every human
              deserves to participate in the most important question our species has
              ever asked.
            </p>
            <div className="mt-8 flex flex-wrap gap-3 justify-center">
              <Link
                href="/signup"
                className="inline-flex items-center gap-2 bg-[#0057FF] text-white font-medium px-6 py-3 rounded-md hover:bg-blue-700 transition-colors text-sm"
              >
                Join the Mission
                <ChevronRight className="w-4 h-4" />
              </Link>
              <Link
                href="/about"
                className="inline-flex items-center gap-2 border border-white/20 text-white font-medium px-6 py-3 rounded-md hover:bg-white/5 transition-colors text-sm"
              >
                Learn the Science
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Strip */}
      <section className="bg-white py-16 border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div>
              <h3 className="text-xl font-bold text-[#0A0A0A]">
                Ready to explore the cosmos?
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                Free forever. No equipment needed. Start in 30 seconds.
              </p>
            </div>
            <Link
              href="/signup"
              className="flex-shrink-0 inline-flex items-center gap-2 bg-[#0057FF] text-white font-medium px-6 py-3 rounded-md hover:bg-blue-700 transition-colors text-sm"
            >
              Create Free Account
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
