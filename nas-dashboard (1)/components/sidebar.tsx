"use client"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  LayoutDashboard,
  HardDrive,
  Users,
  FolderOpen,
  Settings,
  Shield,
  Activity,
  Database,
  Wifi,
  Archive,
  FileText,
  Power,
} from "lucide-react"

interface SidebarProps {
  activeSection: string
  onSectionChange: (section: string) => void
}

const menuItems = [
  {
    id: "overview",
    label: "대시보드 개요",
    icon: LayoutDashboard,
    badge: null,
  },
  {
    id: "storage",
    label: "스토리지 관리",
    icon: HardDrive,
    badge: "85%",
  },
  {
    id: "files",
    label: "파일 관리",
    icon: FolderOpen,
    badge: null,
  },
  {
    id: "users",
    label: "사용자 관리",
    icon: Users,
    badge: "12",
  },
  {
    id: "network",
    label: "네트워크 설정",
    icon: Wifi,
    badge: null,
  },
  {
    id: "backup",
    label: "백업 관리",
    icon: Archive,
    badge: "진행중",
  },
  {
    id: "services",
    label: "서비스 상태",
    icon: Activity,
    badge: "3",
  },
  {
    id: "database",
    label: "데이터베이스",
    icon: Database,
    badge: null,
  },
  {
    id: "security",
    label: "보안 설정",
    icon: Shield,
    badge: null,
  },
  {
    id: "logs",
    label: "시스템 로그",
    icon: FileText,
    badge: "새로운",
  },
  {
    id: "settings",
    label: "시스템 설정",
    icon: Settings,
    badge: null,
  },
]

export function Sidebar({ activeSection, onSectionChange }: SidebarProps) {
  return (
    <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
            <HardDrive className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">NAS 관리</h1>
            <p className="text-sm text-gray-500">v2.1.0</p>
          </div>
        </div>
      </div>

      {/* System Status */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">시스템 상태</span>
          <div className="w-2 h-2 bg-green-500 rounded-full"></div>
        </div>
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">CPU</span>
            <span className="text-gray-900">23%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-1">
            <div className="bg-blue-500 h-1 rounded-full" style={{ width: "23%" }}></div>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-500">메모리</span>
            <span className="text-gray-900">67%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-1">
            <div className="bg-yellow-500 h-1 rounded-full" style={{ width: "67%" }}></div>
          </div>
        </div>
      </div>

      {/* Navigation Menu */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon
          return (
            <Button
              key={item.id}
              variant={activeSection === item.id ? "secondary" : "ghost"}
              className={cn(
                "w-full justify-start h-10 px-3",
                activeSection === item.id && "bg-blue-50 text-blue-700 border-blue-200",
              )}
              onClick={() => onSectionChange(item.id)}
            >
              <Icon className="w-4 h-4 mr-3" />
              <span className="flex-1 text-left">{item.label}</span>
              {item.badge && (
                <Badge variant={activeSection === item.id ? "default" : "secondary"} className="ml-2 text-xs">
                  {item.badge}
                </Badge>
              )}
            </Button>
          )
        })}
      </nav>

      {/* Power Controls */}
      <div className="p-4 border-t border-gray-200">
        <Button variant="outline" className="w-full justify-start bg-transparent" size="sm">
          <Power className="w-4 h-4 mr-2" />
          시스템 재시작
        </Button>
      </div>
    </div>
  )
}
