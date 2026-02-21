import React from 'react'

// SVGR imports
import CheckIcon from '@/assets/icons/checkmark.svg?react'
import ChevronDownIcon from '@/assets/icons/chevron-down.svg?react'
import ChevronLeftIcon from '@/assets/icons/chevron-left.svg?react'
import ChevronRightIcon from '@/assets/icons/chevron-right.svg?react'
import ClockIcon from '@/assets/icons/clock.svg?react'
import CogIcon from '@/assets/icons/cog.svg?react'
import CopyIcon from '@/assets/icons/copy.svg?react'
import CropIcon from '@/assets/icons/crop.svg?react'
import CrossIcon from '@/assets/icons/cross.svg?react'
import DownloadIcon from '@/assets/icons/download.svg?react'
import EyeIcon from '@/assets/icons/eye.svg?react'
import HomeIcon from '@/assets/icons/home.svg?react'
import ImageIcon from '@/assets/icons/image.svg?react'
import InfoIcon from '@/assets/icons/info.svg?react'
import LayersIcon from '@/assets/icons/layers.svg?react'
import MenuIcon from '@/assets/icons/menu.svg?react'
import MinusIcon from '@/assets/icons/minus.svg?react'
import PauseIcon from '@/assets/icons/pause2.svg?react'
import PencilIcon from '@/assets/icons/pencil.svg?react'
import PlayIcon from '@/assets/icons/play3.svg?react'
import PlusIcon from '@/assets/icons/plus.svg?react'
import RedoIcon from '@/assets/icons/redo.svg?react'
import SparklesIcon from '@/assets/icons/sparkles.svg?react'
import SphereIcon from '@/assets/icons/sphere.svg?react'
import StopIcon from '@/assets/icons/stop2.svg?react'
import UndoIcon from '@/assets/icons/undo.svg?react'
import WarningIcon from '@/assets/icons/warning.svg?react'
import ArrowLeftIcon from '@/assets/icons/arrow-left-filled.svg?react'
import ArrowRightIcon from '@/assets/icons/arrow-right-filled.svg?react'
import DiceIcon from '@/assets/icons/dice.svg?react'

const icons = {
  eye: EyeIcon,
  sphere: SphereIcon,
  cog: CogIcon,
  home: HomeIcon,
  image: ImageIcon,
  play: PlayIcon,
  pause: PauseIcon,
  pencil: PencilIcon,
  stop: StopIcon,
  undo: UndoIcon,
  redo: RedoIcon,
  menu: MenuIcon,
  'arrow-left': ArrowLeftIcon,
  'arrow-right': ArrowRightIcon,
  plus: PlusIcon,
  minus: MinusIcon,
  check: CheckIcon,
  cross: CrossIcon,
  warning: WarningIcon,
  info: InfoIcon,
  download: DownloadIcon,
  copy: CopyIcon,
  'chevron-left': ChevronLeftIcon,
  'chevron-right': ChevronRightIcon,
  'chevron-down': ChevronDownIcon,
  sparkles: SparklesIcon,
  crop: CropIcon,
  clock: ClockIcon,
  settings: CogIcon,
  layers: LayersIcon,
  dice: DiceIcon,
} as const

/**
 *
 */
export type IconName = keyof typeof icons

interface IconProps extends React.SVGProps<SVGSVGElement> {
  name: IconName
  size?: number
}

export const Icon: React.FC<IconProps> = React.memo(
  ({ name, className = '', size = 16, ...props }) => {
    const IconComponent = icons[name]
    return <IconComponent width={size} height={size} className={className} {...props} />
  }
)

Icon.displayName = 'Icon'
