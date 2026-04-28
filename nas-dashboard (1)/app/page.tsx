"use client"

import { useState } from "react"
import { Sidebar } from "@/components/sidebar"
import { DashboardContent } from "@/components/dashboard-content"
import { SidebarProvider } from "@/components/ui/sidebar"

export default function NasDashboard() {
  const [activeSection, setActiveSection] = useState("overview")

  return (
    <SidebarProvider>
      <div className="flex h-screen bg-gray-50">
        <Sidebar activeSection={activeSection} onSectionChange={setActiveSection} />
        <DashboardContent activeSection={activeSection} />
      </div>
    </SidebarProvider>
  )
}
