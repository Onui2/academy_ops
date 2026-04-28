import { NextResponse } from "next/server";

type HolidayResponse = {
  date: string;
  localName: string;
  name: string;
};

export async function GET() {
  const currentYear = new Date().getFullYear();
  const years = [currentYear - 1, currentYear, currentYear + 1, currentYear + 2];

  const results = await Promise.all(
    years.map(async (year) => {
      const response = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/KR`, {
        next: { revalidate: 60 * 60 * 24 }
      });

      if (!response.ok) {
        return [] as HolidayResponse[];
      }

      return (await response.json()) as HolidayResponse[];
    })
  );

  const holidays = results.flat().map((holiday) => holiday.date);

  return NextResponse.json(
    { holidays },
    {
      headers: {
        "Cache-Control": "s-maxage=86400, stale-while-revalidate=43200"
      }
    }
  );
}
