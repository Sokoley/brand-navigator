import { NextResponse, NextRequest } from 'next/server';
import { verifyAuth } from '@/lib/auth';

const PROTECTED_ROUTES = [
  { path: '/api/yandex/upload', methods: ['POST'] },
  { path: '/api/yandex/delete', methods: ['DELETE'] },
  { path: '/api/yandex/properties', methods: ['PATCH'] },
  { path: '/api/properties', methods: ['POST', 'PATCH', 'DELETE'] },
  { path: '/api/points', methods: ['POST', 'PATCH', 'DELETE'] },
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const method = request.method;

  // Check if this is a protected route
  const isProtected = PROTECTED_ROUTES.some(
    (route) => pathname.startsWith(route.path) && route.methods.includes(method)
  );

  if (!isProtected) {
    return NextResponse.next();
  }

  const isAuthenticated = await verifyAuth(request);
  if (!isAuthenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/yandex/:path*', '/api/properties', '/api/points'],
};
