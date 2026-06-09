import { Globe, Construction } from "lucide-react";
import { Link } from "wouter";
import Footer from "@/components/layout/footer";

export default function Universe() {
  return (
    <main className="pt-16 min-h-screen bg-white flex flex-col">
      <div className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-24 text-center">
        <div className="w-14 h-14 rounded-xl bg-blue-50 flex items-center justify-center mx-auto mb-6">
          <Globe className="w-7 h-7 text-[#0057FF]" />
        </div>
        <h1 className="text-3xl font-bold text-[#0A0A0A]">Universe Explorer</h1>
        <p className="mt-3 text-gray-500 max-w-md mx-auto">
          The interactive exoplanet map is coming in Phase 3. Explore 5,600+ real confirmed
          exoplanets from open astronomy data with civilization probability scores.
        </p>
        <div className="mt-6 inline-flex items-center gap-2 bg-orange-50 border border-orange-100 rounded-full px-4 py-2">
          <Construction className="w-4 h-4 text-orange-500" />
          <span className="text-sm text-orange-600 font-medium">Coming in Phase 3</span>
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
