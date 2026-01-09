import { Alert, Button, Link } from '@/app/components/ui'
import { HomeIcon } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="flex h-screen flex-col items-stretch justify-start sm:items-center sm:justify-center">
      <Alert
        color="warning"
        variant="faded"
        className="mx-3 mt-3 mb-auto w-auto grow-0 sm:m-auto"
        title="Page Not Found"
        description="The page you requested could not be found."
        hideIconWrapper
        endContent={
          <Button type="button" color="warning" variant="solid" className="ml-3" as={Link} href="/">
            <HomeIcon /> Home
          </Button>
        }
      />
    </div>
  )
}
