import {
  Droplets,
  ChevronsUp,
  CreditCard,
  Coffee,
  Utensils,
  ShoppingCart,
  Wifi,
  Moon,
  Bike,
  Shield,
  type LucideIcon,
} from "lucide-react"

export const AMENITY_ICON_MAP: Record<string, LucideIcon> = {
  wc: Droplets,
  elevator: ChevronsUp,
  atm: CreditCard,
  coffeeShop: Coffee,
  fastFood: Utensils,
  groceryStore: ShoppingCart,
  freeWifi: Wifi,
  prayerRoom: Moon,
  parking: Bike,
  police: Shield,
}
