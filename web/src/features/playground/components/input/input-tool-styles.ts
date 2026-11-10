/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

// Shared across the toolbar buttons and the parameter panel trigger so both
// keep the same hover, focus and touch-target styling.
export const PLAYGROUND_TOOL_BUTTON_CLASS =
  'text-muted-foreground hover:text-foreground hover:bg-muted focus-visible:ring-ring/50 min-h-10 min-w-10 font-medium focus-visible:ring-2 md:min-h-8 md:min-w-8'
