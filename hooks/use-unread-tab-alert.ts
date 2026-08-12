"use client"

import { useCallback, useEffect, useRef } from "react"

const FLASH_INTERVAL_MS = 1000
const ORIGINAL_TITLE = "ChattingLord - Ephemeral Chat & Collaboration"

function formatUnreadTitle(count: number): string {
  const display = count > 99 ? "99+" : String(count)
  const label = count === 1 ? "New message" : "New messages"
  return `(${display}) ${label}`
}

export function useUnreadTabAlert() {
  const unreadCountRef = useRef(0)
  const showingAlertRef = useRef(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const originalTitleRef = useRef(ORIGINAL_TITLE)

  const stopFlash = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    unreadCountRef.current = 0
    showingAlertRef.current = false
    document.title = originalTitleRef.current
  }, [])

  const startFlash = useCallback(() => {
    if (intervalRef.current) return
    originalTitleRef.current = document.title || ORIGINAL_TITLE
    showingAlertRef.current = true
    document.title = formatUnreadTitle(unreadCountRef.current)
    intervalRef.current = setInterval(() => {
      showingAlertRef.current = !showingAlertRef.current
      document.title = showingAlertRef.current
        ? formatUnreadTitle(unreadCountRef.current)
        : originalTitleRef.current
    }, FLASH_INTERVAL_MS)
  }, [])

  const notifyUnread = useCallback(() => {
    unreadCountRef.current += 1
    if (intervalRef.current) {
      if (showingAlertRef.current) {
        document.title = formatUnreadTitle(unreadCountRef.current)
      }
      return
    }
    startFlash()
  }, [startFlash])

  useEffect(() => {
    originalTitleRef.current = document.title || ORIGINAL_TITLE

    const reset = () => {
      if (!document.hidden) stopFlash()
    }

    document.addEventListener("visibilitychange", reset)
    window.addEventListener("focus", reset)

    return () => {
      document.removeEventListener("visibilitychange", reset)
      window.removeEventListener("focus", reset)
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      document.title = originalTitleRef.current
    }
  }, [stopFlash])

  return { notifyUnread }
}
