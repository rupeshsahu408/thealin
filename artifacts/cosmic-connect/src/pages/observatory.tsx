import { Radio, Construction } from "lucide-react";
import { Link } from "wouter";
import Footer from "@/components/layout/footer";

export default function Observatory() {
  return (
    <main className="pt-16 min-h-screen bg-white flex flex-col">
      <div className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-24 text-center">
        <div className="w-14 h-14 rounded-xl bg-blue-50 flex items-center justify-center mx-auto mb-6">
          <Radio className="w-7 h-7 text-[#0057FF]" />
        </div>
        <h1 className="text-3xl font-bold text-[#0A0A0A]">Signal Observatory</h1>
        <p className="mt-3 text-gray-500 max-w-md mx-auto">
          Live signal detection and analysis is coming in Phase 4. The observatory will
          stream real radio telescope data and flag anomalies using AI.
        </p>
        <div className="mt-6 inline-flex items-center gap-2 bg-orange-50 border border-orange-100 rounded-full px-4 py-2">
          <Construction className="w-4 h-4 text-orange-500" />
          <span className="text-sm text-orange-600 font-medium">Coming in Phase 4</span>
        </div>
        <div className="mt-8">
          <Link href="/" className="text-sm text-[#0057FF] hover:underline font-medium">
            Back to Home
          </Link>
        </div>
      </div>
      <Footer />
    </main>
  );
}
