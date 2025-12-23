export const config = {
  // Add your matcher here to specify which routes the middleware should protect
  matcher: ['/((?!api|_next\/static|_next\/image|.*\\.png$).*)'],
}

export { auth as proxy } from "@/auth"

