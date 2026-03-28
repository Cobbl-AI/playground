import { PlaygroundPage } from '@/components/PlaygroundPage'

type PageProps = {
  searchParams: Promise<{ slug?: string }>
}

const Page = async ({ searchParams }: PageProps) => {
  const { slug } = await searchParams
  return <PlaygroundPage slug={slug} />
}

export default Page
