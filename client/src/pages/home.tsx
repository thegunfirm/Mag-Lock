import { SearchHero } from "@/components/search/search-hero";
import { TierCards } from "@/components/membership/tier-cards";
import { useAuth } from "@/hooks/use-auth";

export default function Home() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen">
      {/* Hero Search Section */}
      <SearchHero />
      
      {/* Browse Products CTA */}
      <div className="mt-4 flex justify-center">
        <a href="/products" className="inline-block rounded-xl bg-black text-white px-4 py-2 text-sm font-medium hover:opacity-90">
          Browse products
        </a>
      </div>

      {/* Membership Tiers Section */}
      <section className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-oswald font-bold text-gun-black mb-4">
              MEMBERSHIP TIERS
            </h2>
            <p className="text-xl text-gun-gray-light max-w-3xl mx-auto">
              Unlock exclusive pricing and benefits with our membership tiers. Choose the level that fits your needs.
            </p>
          </div>

          <TierCards />
        </div>
      </section>
    </div>
  );
}