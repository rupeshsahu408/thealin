import Footer from "@/components/layout/footer";

const principles = [
  {
    title: "Open Science",
    description:
      "Every algorithm, every data source, every method we use is open and transparent. Science belongs to everyone.",
  },
  {
    title: "Real Data Only",
    description:
      "We never show simulated data disguised as real signals. If something is a model or estimate, we label it clearly.",
  },
  {
    title: "Always Free",
    description:
      "Thealins will never charge for access. The search for other civilizations is humanity's mission, not a product.",
  },
  {
    title: "Community First",
    description:
      "No single organization — not NASA, not any government — should own the search for extraterrestrial intelligence.",
  },
];

const scienceFacts = [
  {
    term: "1420 MHz",
    definition:
      "The hydrogen line frequency — the most abundant element in the universe emits at this frequency. Any civilization with radio technology will know it.",
  },
  {
    term: "Drake Equation",
    definition:
      "Formulated by Frank Drake in 1961, it estimates the number of communicative civilizations in our galaxy. Conservative estimates suggest thousands may exist.",
  },
  {
    term: "Fermi Paradox",
    definition:
      "If intelligent civilizations are probable, why haven't we detected any? Thealins exists to help answer this question.",
  },
  {
    term: "Arecibo Message",
    definition:
      "In 1974, humanity sent its first intentional interstellar radio message from the Arecibo telescope in Puerto Rico. It encoded our DNA, our solar system, and our mathematics.",
  },
  {
    term: "Technosignatures",
    definition:
      "Signs of technology from other civilizations — radio emissions, unusual light patterns from mega-structures, or heat signatures from advanced energy use.",
  },
  {
    term: "WebSDR",
    definition:
      "A network of internet-connected radio receivers worldwide that anyone can access for free via a browser, enabling real signal monitoring without owning hardware.",
  },
];

export default function About() {
  return (
    <main className="pt-16">
      {/* Hero */}
      <section className="bg-white py-20 md:py-28 border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold text-[#0057FF] uppercase tracking-widest mb-4">
              About Thealins
            </p>
            <h1 className="text-4xl md:text-5xl font-bold text-[#0A0A0A] leading-tight">
              The most important question our species has ever asked
            </h1>
            <p className="mt-6 text-gray-500 leading-relaxed text-lg">
              Are we alone? For decades, only government agencies and well-funded
              institutions could participate in the search. Thealins changes that.
            </p>
          </div>
        </div>
      </section>

      {/* Principles */}
      <section className="bg-white py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-xs font-semibold text-[#0057FF] uppercase tracking-widest mb-10">
            Our principles
          </p>
          <div className="grid sm:grid-cols-2 gap-6">
            {principles.map((p) => (
              <div
                key={p.title}
                className="border border-gray-100 rounded-xl p-6 hover:border-blue-100 transition-colors"
              >
                <h3 className="font-semibold text-[#0A0A0A] mb-2">{p.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{p.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Science Glossary */}
      <section className="bg-gray-50 py-16 md:py-24 border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-xs font-semibold text-[#0057FF] uppercase tracking-widest mb-3">
            The science
          </p>
          <h2 className="text-3xl font-bold text-[#0A0A0A] mb-10">
            Key concepts explained
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {scienceFacts.map((fact) => (
              <div key={fact.term} className="bg-white border border-gray-100 rounded-xl p-5">
                <div className="font-mono text-[#0057FF] font-bold text-sm mb-2">
                  {fact.term}
                </div>
                <p className="text-sm text-gray-500 leading-relaxed">{fact.definition}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
