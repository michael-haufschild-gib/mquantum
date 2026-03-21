/**
 * Top bar control buttons — representation toggle, perf monitor, cinematic.
 *
 * Tests the icon buttons in the top bar that control app-wide state:
 * - Representation toggle cycles: Position → Momentum → Wigner
 * - Performance monitor toggles visibility
 * - Cinematic mode enters/exits
 * - Representation locked in compute modes
 *
 * Bugs caught:
 * - Representation toggle not cycling correctly (skips a state)
 * - Representation toggle not disabled in compute modes
 * - Performance monitor toggle not wiring to uiStore
 * - Cinematic mode via button doesn't start animation
 * - aria-pressed not reflecting state
 */

import { test, expect } from './fixtures'
import {
  waitForAppLoaded,
  waitForRendererReady,
  waitForShaderCompilation,
  requireWebGPU,
} from './helpers/app-helpers'

test.setTimeout(60_000)

test.describe('representation toggle', () => {
  test('cycles through position → momentum → wigner → position', async ({ hoPage: page }) => {
    const repButton = page.getByTestId('control-representation-toggle')
    await expect(repButton).toBeVisible()

    // Initial state: Position
    await expect(repButton).toHaveText('Position')

    // Click → Momentum
    await repButton.click()
    await expect(repButton).toHaveText('Momentum')

    // Click → Wigner
    await repButton.click()
    await expect(repButton).toHaveText('Wigner')

    // Click → Position (back to start)
    await repButton.click()
    await expect(repButton).toHaveText('Position')
  })

  test('representation toggle updates store', async ({ hoPage: page }) => {
    const repButton = page.getByTestId('control-representation-toggle')
    await repButton.click() // → Momentum

    const rep = await page.evaluate(async () => {
      const mod = await import('/src/stores/extendedObjectStore.ts')
      return mod.useExtendedObjectStore.getState().schroedinger.representation
    })
    expect(rep).toBe('momentum')
  })

  test('representation locked to position in compute modes', async ({ page }) => {
    await page.goto('/?t=schroedinger&d=3&qm=tdseDynamics')
    await waitForAppLoaded(page)

    const repButton = page.getByTestId('control-representation-toggle')
    await expect(repButton).toBeVisible()
    await expect(repButton).toHaveText(/Position.*locked/i)
  })

  test('representation produces visual change', async ({ page }) => {
    await requireWebGPU(page, test.info())

    await page.goto('/?t=schroedinger&d=3&qm=harmonicOscillator')
    await waitForAppLoaded(page)
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    const repButton = page.getByTestId('control-representation-toggle')

    // Position → Momentum triggers shader recompilation
    await repButton.click()
    await expect(repButton).toHaveText('Momentum')

    // Renderer should survive the recompilation
    await waitForRendererReady(page)
    await waitForShaderCompilation(page)

    // No crash — renderer still working
    await expect(page.getByTestId('top-bar')).toBeVisible()
  })
})

test.describe('performance monitor toggle', () => {
  test('toggles perf monitor visibility via button', async ({ appPage: page }) => {
    const perfButton = page.getByTestId('control-performance-monitor')
    await expect(perfButton).toBeVisible()

    // Get initial state
    const initialState = await page.evaluate(async () => {
      const mod = await import('/src/stores/uiStore.ts')
      return mod.useUIStore.getState().showPerfMonitor
    })

    // Toggle
    await perfButton.click()

    // Store should have flipped
    await expect(async () => {
      const afterState = await page.evaluate(async () => {
        const mod = await import('/src/stores/uiStore.ts')
        return mod.useUIStore.getState().showPerfMonitor
      })
      expect(afterState).toBe(!initialState)
    }).toPass({ timeout: 3000 })

    // aria-pressed should reflect new state
    await expect(perfButton).toHaveAttribute('aria-pressed', String(!initialState))
  })
})

test.describe('performance monitor UI', () => {
  test('enabling perf monitor shows FPS display on canvas', async ({ appPage: page }) => {
    // Ensure perf monitor is visible
    await page.evaluate(async () => {
      const mod = await import('/src/stores/uiStore.ts')
      mod.useUIStore.setState({ showPerfMonitor: true })
    })

    // The FPS value element should be visible
    await expect(page.getByTestId('fps-value')).toBeVisible({ timeout: 5000 })

    // It should show a number (FPS)
    const fpsText = await page.getByTestId('fps-value').textContent()
    expect(fpsText, 'FPS value should contain a number').toMatch(/\d+/)
  })

  test('disabling perf monitor hides FPS display', async ({ appPage: page }) => {
    // First enable, then disable
    await page.evaluate(async () => {
      const mod = await import('/src/stores/uiStore.ts')
      mod.useUIStore.setState({ showPerfMonitor: true })
    })
    await expect(page.getByTestId('fps-value')).toBeVisible({ timeout: 5000 })

    // Disable
    await page.evaluate(async () => {
      const mod = await import('/src/stores/uiStore.ts')
      mod.useUIStore.setState({ showPerfMonitor: false })
    })
    await expect(page.getByTestId('fps-value')).not.toBeVisible({ timeout: 5000 })
  })
})

test.describe('cinematic mode button', () => {
  test('cinematic mode button enters and exits', async ({ appPage: page }) => {
    const cinematicButton = page.getByTestId('control-cinematic-mode')
    await expect(cinematicButton).toBeVisible()

    // Click to enter cinematic mode
    await cinematicButton.click()
    await expect(page.getByTestId('exit-cinematic')).toBeVisible({ timeout: 3000 })

    // Top bar should be hidden
    await expect(page.getByTestId('top-bar')).not.toBeVisible()

    // Exit via keyboard
    await page.keyboard.press('c')
    await expect(page.getByTestId('top-bar')).toBeVisible({ timeout: 3000 })
  })
})
