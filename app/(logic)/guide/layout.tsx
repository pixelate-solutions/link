import "/styles.css"
import { HeaderSimple } from "@/components/header-simple"

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <HeaderSimple />
      <main>{children}</main>
    </>
  )
}
