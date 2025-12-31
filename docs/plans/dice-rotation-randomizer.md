# Dice Rotation Randomizer Feature Plan

## Overview
Add a dice icon button next to the "Select All" / "Deselect All" buttons in the rotation drawer. Clicking the dice randomly activates/deactivates rotation planes, ensuring at least one plane remains active.

## Files to Modify

### 1. `src/components/ui/Icon.tsx`
**Purpose**: Add dice icon to the icon registry

**Changes**:
- Import dice SVG: `import DiceIcon from '@/assets/icons/dice.svg?react';`
- Add to icons map: `dice: DiceIcon`

### 2. `src/stores/animationStore.ts`
**Purpose**: Add randomize planes action

**Changes**:
Add new action to `AnimationState` interface and implementation:

```typescript
// In interface
randomizePlanes: (dimension: number) => void

// In implementation
randomizePlanes: (dimension: number) => {
  const planes = getRotationPlanes(dimension);
  const planeNames = planes.map(p => p.name);

  // Generate random selection (each plane has 50% chance)
  const selected = planeNames.filter(() => Math.random() < 0.5);

  // Ensure at least one plane is selected
  if (selected.length === 0) {
    const randomIndex = Math.floor(Math.random() * planeNames.length);
    selected.push(planeNames[randomIndex]);
  }

  set({
    animatingPlanes: new Set(selected),
    isPlaying: true  // Auto-start animation like animateAll does
  });
}
```

### 3. `src/components/layout/TimelineControls.tsx`
**Purpose**: Add dice button to rotation drawer header

**Changes**:

1. Add `randomizePlanes` to the animation store selector (line ~35):
```typescript
randomizePlanes: state.randomizePlanes,
```

2. Add to destructured values (line ~48):
```typescript
randomizePlanes
```

3. Add dice button in the header row (after line 167, before closing `</div>`):
```tsx
<Button
    variant="ghost"
    size="icon"
    onClick={() => randomizePlanes(dimension)}
    ariaLabel="Randomize rotation planes"
    className="w-7 h-7 p-0 rounded-lg flex items-center justify-center text-text-secondary hover:text-accent"
>
    <Icon name="dice" size={14} />
</Button>
```

**Updated header structure** (lines 148-168):
```tsx
<div className="flex items-center justify-between">
    <h3 className="text-[10px] font-bold text-text-secondary uppercase tracking-widest">Rotation Planes</h3>
    <div className="flex gap-2 items-center">
        <Button
            variant="ghost"
            size="sm"
            onClick={() => animateAll(dimension)}
            className="text-[10px] uppercase font-bold text-accent hover:text-accent-glow px-2 py-1"
        >
            Select All
        </Button>
        <Button
            variant="ghost"
            size="sm"
            onClick={() => clearAllPlanes()}
            className="text-[10px] uppercase font-bold px-2 py-1"
        >
            Deselect All
        </Button>
        <Button
            variant="ghost"
            size="icon"
            onClick={() => randomizePlanes(dimension)}
            ariaLabel="Randomize rotation planes"
            className="w-7 h-7 p-0 rounded-lg flex items-center justify-center text-text-secondary hover:text-accent"
        >
            <Icon name="dice" size={14} />
        </Button>
    </div>
</div>
```

## Tests to Add/Update

### 1. `src/tests/stores/animationStore.test.ts`
Add tests for `randomizePlanes`:

```typescript
describe('randomizePlanes', () => {
  it('should select at least one plane', () => {
    // Run multiple times to ensure constraint holds
    for (let i = 0; i < 100; i++) {
      store.getState().randomizePlanes(4);
      expect(store.getState().animatingPlanes.size).toBeGreaterThanOrEqual(1);
    }
  });

  it('should only select planes valid for the given dimension', () => {
    store.getState().randomizePlanes(3);
    const validPlanes = getRotationPlanes(3).map(p => p.name);
    const selected = Array.from(store.getState().animatingPlanes);
    selected.forEach(plane => {
      expect(validPlanes).toContain(plane);
    });
  });

  it('should auto-start animation', () => {
    store.getState().randomizePlanes(4);
    expect(store.getState().isPlaying).toBe(true);
  });
});
```

### 2. `src/tests/components/layout/editor/TimelineControls.test.tsx`
Add test for dice button:

```typescript
it('should show randomize button in rotation drawer', async () => {
  render(<TimelineControls />);

  // Open rotation drawer
  const rotateButton = screen.getByRole('button', { name: /toggle rotation drawer/i });
  await userEvent.click(rotateButton);

  // Check for dice button
  const randomizeButton = screen.getByRole('button', { name: /randomize rotation planes/i });
  expect(randomizeButton).toBeInTheDocument();
});

it('should randomize planes when dice button is clicked', async () => {
  render(<TimelineControls />);

  // Open rotation drawer
  const rotateButton = screen.getByRole('button', { name: /toggle rotation drawer/i });
  await userEvent.click(rotateButton);

  // Click randomize
  const randomizeButton = screen.getByRole('button', { name: /randomize rotation planes/i });
  await userEvent.click(randomizeButton);

  // Verify at least one plane is selected
  const store = useAnimationStore.getState();
  expect(store.animatingPlanes.size).toBeGreaterThanOrEqual(1);
});
```

## Visual Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ ROTATION PLANES          [Select All] [Deselect All] [🎲]      │
├─────────────────────────────────────────────────────────────────┤
│ [XY] [YZ] [XZ] [XW] [YW] [ZW] ...                               │
└─────────────────────────────────────────────────────────────────┘
```

## Implementation Order

1. Add dice icon to Icon component
2. Add `randomizePlanes` action to animation store
3. Add dice button to TimelineControls
4. Add unit tests for animation store
5. Add component tests for TimelineControls
6. Run all tests to verify

## Edge Cases

- **0 planes selected by random**: Guaranteed to select 1 random plane
- **All planes selected by random**: Valid outcome, no intervention needed
- **Dimension change after randomize**: Existing `setDimension` logic filters invalid planes
