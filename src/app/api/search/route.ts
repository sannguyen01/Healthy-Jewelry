import { NextRequest, NextResponse } from 'next/server'
import { searchProducts } from '@/lib/shopify'

export async function GET(request: NextRequest): Promise<NextResponse> {
  const query = request.nextUrl.searchParams.get('q') ?? ''
  if (!query.trim()) return NextResponse.json({ products: [] })
  const products = await searchProducts(query)
  return NextResponse.json({ products })
}
