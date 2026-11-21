import { useEffect, useState, type ReactNode } from 'react';
import {
  Activity,
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  BarChart3,
  Bluetooth,
  Flame,
  Gauge,
  GripVertical,
  Heart,
  History,
  LayoutGrid,
  Maximize2,
  Move,
  PictureInPicture2,
  Play,
  Plus,
  RotateCcw,
  Route,
  SlidersHorizontal,
  Timer,
  Tv,
  Volume2,
  X,
  Zap,
} from 'lucide-react';
import {
  COCKPIT_TILE_META,
  LAYOUT_PRESETS,
  MAX_ACTIVE_TILES,
  MIN_ACTIVE_TILES,
  SECONDARY_STAT_META,
  TOPBAR_ACTION_META,
  TRANSPORT_CONTROL_META,
  addActiveTile,
  createDefaultLayoutPrefs,
  getAvailableTiles,
  isDefaultLayoutPrefs,
  layoutPrefsEqual,
  moveOrderItem,
  removeActiveTile,
  reorderOrderItem,
  replaceActiveTile,
  type CockpitTileId,
  type LayoutItemMeta,
  type LayoutPreferences,
  type SecondaryStatId,
  type TopbarActionId,
  type TransportControlId,
} from '../utils/layoutPrefs';

type CustomizeTab = 'tiles' | 'controls';

interface CustomizeLayoutModalProps {
  isOpen: boolean;
  prefs: LayoutPreferences;
  onChangePrefs: (next: LayoutPreferences) => void;
  onStartInlineArrange?: () => void;
  onClose: () => void;
}

const TILE_ICONS: Record<CockpitTileId, ReactNode> = {
  power: <Zap size={15} />,
  cadence: <Gauge size={15} />,
  hr: <Heart size={15} />,
  speed: <Gauge size={15} />,
  distance: <Route size={15} />,
  calories: <Flame size={15} />,
  avgPower: <Activity size={15} />,
  stats: <LayoutGrid size={15} />,
  interval: <Timer size={15} />,
  zones: <BarChart3 size={15} />,
};

const STAT_ICONS: Record<SecondaryStatId, ReactNode> = {
  speed: <Gauge size={14} />,
  distance: <Route size={14} />,
  calories: <Flame size={14} />,
  avgPower: <Zap size={14} />,
  burnTime: <Activity size={14} />,
};

const TOPBAR_ICONS: Record<TopbarActionId, ReactNode> = {
  sensors: <Bluetooth size={14} />,
  youtube: <Tv size={14} />,
  pip: <PictureInPicture2 size={14} />,
  simulate: <SlidersHorizontal size={14} />,
  history: <History size={14} />,
};

const TRANSPORT_ICONS: Record<TransportControlId, ReactNode> = {
  gaugeMode: <Gauge size={14} />,
  focus: <Maximize2 size={14} />,
  rideAction: <Play size={14} />,
  audio: <Volume2 size={14} />,
};

function getCockpitSlotTag(index: number): string {
  if (index < 3) return 'Main · PiP';
  if (index === 3) return '2×2 & Focus';
  return 'Wide Row 2';
}

interface SortableOrderListProps<T extends string> {
  listId: string;
  ariaLabel: string;
  order: readonly T[];
  meta: Record<T, LayoutItemMeta>;
  icons: Record<T, ReactNode>;
  slotTagForIndex?: (index: number) => string | undefined;
  canRemove?: boolean;
  onRemoveItem?: (id: T) => void;
  onChangeOrder: (next: T[]) => void;
}

function SortableOrderList<T extends string>({
  listId,
  ariaLabel,
  order,
  meta,
  icons,
  slotTagForIndex,
  canRemove = false,
  onRemoveItem,
  onChangeOrder,
}: SortableOrderListProps<T>) {
  const [draggedId, setDraggedId] = useState<T | null>(null);
  const [dragOverId, setDragOverId] = useState<T | null>(null);

  return (
    <ol className="layout-order-list" id={listId} aria-label={ariaLabel}>
      {order.map((id, idx) => {
        const item = meta[id];
        const isFirst = idx === 0;
        const isLast = idx === order.length - 1;
        const isDragging = draggedId === id;
        const isOver = dragOverId === id && draggedId !== null && draggedId !== id;
        const badgeText = slotTagForIndex ? slotTagForIndex(idx) : item.kindTag;

        return (
          <li
            key={id}
            data-order-item={id}
            className={`layout-order-row${isDragging ? ' is-dragging' : ''}${isOver ? ' is-drag-over' : ''}`}
            draggable
            onDragStart={(e) => {
              setDraggedId(id);
              e.dataTransfer.effectAllowed = 'move';
              e.dataTransfer.setData('text/plain', id);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (dragOverId !== id) setDragOverId(id);
            }}
            onDragLeave={() => {
              if (dragOverId === id) setDragOverId(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              const sourceId = (draggedId ?? e.dataTransfer.getData('text/plain')) as T;
              if (sourceId && order.includes(sourceId) && sourceId !== id) {
                onChangeOrder(reorderOrderItem(order, sourceId, id));
              }
              setDraggedId(null);
              setDragOverId(null);
            }}
            onDragEnd={() => {
              setDraggedId(null);
              setDragOverId(null);
            }}
          >
            <span className="layout-drag-handle" aria-hidden="true" title="Drag to reorder">
              <GripVertical size={15} />
            </span>

            <span className="layout-pos-badge tabular">{idx + 1}</span>

            <span className="layout-item-icon" aria-hidden="true">
              {icons[id]}
            </span>

            <div className="layout-item-copy">
              <div className="layout-item-head">
                <span className="layout-item-title">{item.label}</span>
                {badgeText && <span className="layout-scope-tag">{badgeText}</span>}
              </div>
              <span className="layout-item-desc">{item.description}</span>
            </div>

            <div className="layout-row-arrows">
              <button
                type="button"
                id={`${listId}-up-${id}`}
                className="layout-arrow-btn"
                disabled={isFirst}
                onClick={() => onChangeOrder(moveOrderItem(order, id, -1))}
                aria-label={`Move ${item.label} earlier`}
                title={`Move ${item.label} earlier`}
              >
                <ArrowUp size={15} />
              </button>
              <button
                type="button"
                id={`${listId}-down-${id}`}
                className="layout-arrow-btn"
                disabled={isLast}
                onClick={() => onChangeOrder(moveOrderItem(order, id, 1))}
                aria-label={`Move ${item.label} later`}
                title={`Move ${item.label} later`}
              >
                <ArrowDown size={15} />
              </button>
              {onRemoveItem && (
                <button
                  type="button"
                  id={`${listId}-remove-${id}`}
                  className="layout-arrow-btn layout-remove-btn"
                  disabled={!canRemove}
                  onClick={() => onRemoveItem(id)}
                  aria-label={`Remove ${item.label} from main tiles`}
                  title={
                    canRemove
                      ? `Remove ${item.label} from main tiles`
                      : `Keep at least ${MIN_ACTIVE_TILES} main tiles`
                  }
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function CustomizeLayoutModal({
  isOpen,
  prefs,
  onChangePrefs,
  onStartInlineArrange,
  onClose,
}: CustomizeLayoutModalProps) {
  const [activeTab, setActiveTab] = useState<CustomizeTab>('tiles');
  const [swappingTileId, setSwappingTileId] = useState<CockpitTileId | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isDefault = isDefaultLayoutPrefs(prefs);
  const availableTiles = getAvailableTiles(prefs.tileOrder);
  const canAddTile = prefs.tileOrder.length < MAX_ACTIVE_TILES;
  const canRemoveTile = prefs.tileOrder.length > MIN_ACTIVE_TILES;

  return (
    <div
      className="modal-backdrop"
      style={{ zIndex: 1300 }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="customize-layout-title"
    >
      <div
        className="modal-card customize-layout-modal"
        id="customize-layout-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <h2 className="modal-title" id="customize-layout-title">
              Customize Screen Layout
            </h2>
            <p className="modal-subtitle">
              Choose which metrics appear as your main tiles (e.g. swap Heart Rate for Speed or
              Distance) and arrange tiles &amp; toolbar icons across Main Studio, Focus Mode, and
              the Floating PiP HUD.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-sm"
            id="close-layout-modal-btn"
            onClick={onClose}
            aria-label="Close customize layout"
          >
            <X size={16} />
          </button>
        </div>

        {/* Quick Presets */}
        <div className="layout-presets-row" role="group" aria-label="Layout presets">
          {LAYOUT_PRESETS.map((preset) => {
            const active = layoutPrefsEqual(prefs, preset.prefs);
            return (
              <button
                key={preset.id}
                type="button"
                id={`layout-preset-${preset.id}`}
                className={`layout-preset-btn${active ? ' active' : ''}`}
                aria-pressed={active}
                onClick={() => {
                  setSwappingTileId(null);
                  onChangePrefs({
                    tileOrder: [...preset.prefs.tileOrder],
                    secondaryStatOrder: [...preset.prefs.secondaryStatOrder],
                    topbarActionOrder: [...preset.prefs.topbarActionOrder],
                    transportControlOrder: [...preset.prefs.transportControlOrder],
                  });
                }}
              >
                <strong>{preset.name}</strong>
                <span>{preset.summary}</span>
              </button>
            );
          })}
        </div>

        {/* Section Tabs */}
        <div className="legal-tab-bar" role="tablist" aria-label="Layout sections">
          <button
            type="button"
            role="tab"
            id="layout-tab-tiles"
            aria-selected={activeTab === 'tiles'}
            className={`legal-tab-btn${activeTab === 'tiles' ? ' active' : ''}`}
            onClick={() => setActiveTab('tiles')}
          >
            <LayoutGrid size={15} /> Main Tiles ({prefs.tileOrder.length})
          </button>
          <button
            type="button"
            role="tab"
            id="layout-tab-controls"
            aria-selected={activeTab === 'controls'}
            className={`legal-tab-btn${activeTab === 'controls' ? ' active' : ''}`}
            onClick={() => setActiveTab('controls')}
          >
            <SlidersHorizontal size={15} /> Icons &amp; Controls
          </button>
        </div>

        {activeTab === 'tiles' ? (
          <div className="layout-tab-panel" id="layout-panel-tiles">
            {/* Active Main Cockpit Tiles */}
            <div className="layout-section-box">
              <div className="layout-section-head">
                <h3 className="layout-section-title">
                  Active Main Tiles ({prefs.tileOrder.length} / {MAX_ACTIVE_TILES})
                </h3>
                <span className="layout-section-hint">
                  #1–#3 drive Top Row, Bars &amp; PiP · #1–#4 drive Focus &amp; Phone
                </span>
              </div>

              <div
                className="layout-preview-grid"
                data-tile-count={prefs.tileOrder.length}
                aria-hidden="true"
              >
                {prefs.tileOrder.map((tileId, idx) => (
                  <div key={tileId} className="layout-preview-tile">
                    <span className="layout-preview-idx tabular">{idx + 1}</span>
                    <span className="layout-preview-icon">{TILE_ICONS[tileId]}</span>
                    <span className="layout-preview-label">
                      {COCKPIT_TILE_META[tileId].shortLabel}
                    </span>
                  </div>
                ))}
              </div>

              <SortableOrderList
                listId="cockpit-tiles-order-list"
                ariaLabel="Active cockpit tiles order"
                order={prefs.tileOrder}
                meta={COCKPIT_TILE_META}
                icons={TILE_ICONS}
                slotTagForIndex={getCockpitSlotTag}
                canRemove={canRemoveTile}
                onRemoveItem={(tileId) => {
                  setSwappingTileId(null);
                  onChangePrefs({
                    ...prefs,
                    tileOrder: removeActiveTile(prefs.tileOrder, tileId),
                  });
                }}
                onChangeOrder={(tileOrder) => onChangePrefs({ ...prefs, tileOrder })}
              />
            </div>

            {/* Available Tiles Library — Swap in Speed, Distance, Calories, Avg Power, etc. */}
            {availableTiles.length > 0 && (
              <div className="layout-section-box" id="available-tiles-library">
                <div className="layout-section-head">
                  <h3 className="layout-section-title">Available Tiles to Add or Swap In</h3>
                  <span className="layout-section-hint">
                    {canAddTile
                      ? `Add up to ${MAX_ACTIVE_TILES - prefs.tileOrder.length} more or swap any slot`
                      : 'Tap Swap In to replace any active tile (e.g. Heart Rate → Speed)'}
                  </span>
                </div>

                <div className="layout-available-list">
                  {availableTiles.map((tileId) => {
                    const item = COCKPIT_TILE_META[tileId];
                    const isPickingSwap = swappingTileId === tileId;
                    return (
                      <div
                        key={tileId}
                        className="layout-available-card"
                        data-available-tile={tileId}
                      >
                        <div className="layout-available-main">
                          <div className="layout-available-info">
                            <span className="layout-item-icon" aria-hidden="true">
                              {TILE_ICONS[tileId]}
                            </span>
                            <div className="layout-item-copy">
                              <div className="layout-item-head">
                                <span className="layout-item-title">{item.label}</span>
                                {item.kindTag && (
                                  <span className="layout-scope-tag">{item.kindTag}</span>
                                )}
                              </div>
                              <span className="layout-item-desc">{item.description}</span>
                            </div>
                          </div>
                          <div className="layout-available-actions">
                            {canAddTile && (
                              <button
                                type="button"
                                id={`add-tile-${tileId}`}
                                className="btn btn-sm btn-primary"
                                onClick={() => {
                                  setSwappingTileId(null);
                                  onChangePrefs({
                                    ...prefs,
                                    tileOrder: addActiveTile(prefs.tileOrder, tileId),
                                  });
                                }}
                              >
                                <Plus size={14} /> Add
                              </button>
                            )}
                            <button
                              type="button"
                              id={`swap-tile-${tileId}`}
                              className={`btn btn-sm${isPickingSwap ? ' btn-primary' : ''}`}
                              aria-expanded={isPickingSwap}
                              onClick={() =>
                                setSwappingTileId((curr) => (curr === tileId ? null : tileId))
                              }
                            >
                              <ArrowLeftRight size={13} /> Swap in
                            </button>
                          </div>
                        </div>

                        {isPickingSwap && (
                          <div className="layout-swap-picker" role="group" aria-label={`Choose slot to replace with ${item.label}`}>
                            <span className="layout-swap-prompt">Replace which tile?</span>
                            <div className="layout-swap-chips">
                              {prefs.tileOrder.map((activeId, idx) => (
                                <button
                                  key={activeId}
                                  type="button"
                                  id={`swap-${tileId}-into-${activeId}`}
                                  className="btn btn-sm layout-swap-chip"
                                  onClick={() => {
                                    onChangePrefs({
                                      ...prefs,
                                      tileOrder: replaceActiveTile(
                                        prefs.tileOrder,
                                        activeId,
                                        tileId
                                      ),
                                    });
                                    setSwappingTileId(null);
                                  }}
                                >
                                  #{idx + 1} {COCKPIT_TILE_META[activeId].shortLabel}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="layout-section-box">
              <div className="layout-section-head">
                <h3 className="layout-section-title">Ride Stats Strip Order</h3>
                <span className="layout-section-hint">Ride Stats Quad &amp; Bars Strip</span>
              </div>

              <SortableOrderList
                listId="secondary-stats-order-list"
                ariaLabel="Ride stats order"
                order={prefs.secondaryStatOrder}
                meta={SECONDARY_STAT_META}
                icons={STAT_ICONS}
                onChangeOrder={(secondaryStatOrder) =>
                  onChangePrefs({ ...prefs, secondaryStatOrder })
                }
              />
            </div>
          </div>
        ) : (
          <div className="layout-tab-panel" id="layout-panel-controls">
            <div className="layout-section-box">
              <div className="layout-section-head">
                <h3 className="layout-section-title">Topbar Action Icons</h3>
                <span className="layout-section-hint">#1 spans full-width on phones</span>
              </div>

              <div className="layout-preview-strip" aria-hidden="true">
                {prefs.topbarActionOrder.map((actionId, idx) => (
                  <span key={actionId} className="layout-preview-pill">
                    <span className="layout-preview-pill-num tabular">{idx + 1}</span>
                    {TOPBAR_ICONS[actionId]}
                    <span>{TOPBAR_ACTION_META[actionId].shortLabel}</span>
                  </span>
                ))}
              </div>

              <SortableOrderList
                listId="topbar-actions-order-list"
                ariaLabel="Topbar action icons order"
                order={prefs.topbarActionOrder}
                meta={TOPBAR_ACTION_META}
                icons={TOPBAR_ICONS}
                onChangeOrder={(topbarActionOrder) =>
                  onChangePrefs({ ...prefs, topbarActionOrder })
                }
              />
            </div>

            <div className="layout-section-box">
              <div className="layout-section-head">
                <h3 className="layout-section-title">Workout Bar Controls</h3>
                <span className="layout-section-hint">
                  Gauge style, Focus, Start/Pause &amp; Audio
                </span>
              </div>

              <div className="layout-preview-strip" aria-hidden="true">
                {prefs.transportControlOrder.map((ctrlId, idx) => (
                  <span key={ctrlId} className="layout-preview-pill">
                    <span className="layout-preview-pill-num tabular">{idx + 1}</span>
                    {TRANSPORT_ICONS[ctrlId]}
                    <span>{TRANSPORT_CONTROL_META[ctrlId].shortLabel}</span>
                  </span>
                ))}
              </div>

              <SortableOrderList
                listId="transport-controls-order-list"
                ariaLabel="Workout bar controls order"
                order={prefs.transportControlOrder}
                meta={TRANSPORT_CONTROL_META}
                icons={TRANSPORT_ICONS}
                onChangeOrder={(transportControlOrder) =>
                  onChangePrefs({ ...prefs, transportControlOrder })
                }
              />
            </div>
          </div>
        )}

        <div className="layout-modal-footer">
          <div className="layout-footer-left">
            <button
              type="button"
              className="btn btn-sm"
              id="reset-layout-defaults-btn"
              disabled={isDefault}
              onClick={() => {
                setSwappingTileId(null);
                onChangePrefs(createDefaultLayoutPrefs());
              }}
            >
              <RotateCcw size={14} /> Reset to Default
            </button>
            {onStartInlineArrange && (
              <button
                type="button"
                className="btn btn-sm"
                id="start-inline-arrange-btn"
                onClick={onStartInlineArrange}
                title="Close panel and drag tiles or icons directly on the live cockpit"
              >
                <Move size={14} /> Arrange on Screen
              </button>
            )}
          </div>
          <button
            type="button"
            className="btn btn-primary"
            id="save-layout-done-btn"
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
