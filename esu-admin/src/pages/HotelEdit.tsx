import { useState, useEffect } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { currentUser, showToast } from '../store';
import { createHotel, updateHotel, getHotel, type HotelCreateBody, type BackendHotel } from '../api/hotel';
import { FRONTEND_STATUS_MAP } from '../api/hotel';
import { createRoomType, updateRoomType, deleteRoomType, type BackendRoomType } from '../api/roomType';
import { showConfirm } from '../store';
import './HotelEdit.css';

type RoomTypeRow = Pick<BackendRoomType, 'id' | 'name' | 'price' | 'stock' | 'capacity' | 'description'>;

const defaultOpeningDate = () => new Date().toISOString().slice(0, 10);

/** 逗号或换行分隔的字符串转为数组，过滤空与超长 */
function parseList(value: string, maxLen = 50): string[] {
  return value
    .split(/[,，\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 1 && s.length <= maxLen);
}

const emptyForm = () => ({
  nameZh: '',
  nameEn: '',
  address: '',
  starRating: 3,
  openingDate: defaultOpeningDate(),
  nearbyAttractions: [] as string[],
  images: [] as string[],
  facilities: [] as string[],
  tags: [] as string[],
});

function backendToForm(h: BackendHotel) {
  return {
    nameZh: h.nameZh ?? '',
    nameEn: h.nameEn ?? '',
    address: h.address ?? '',
    starRating: h.starRating ?? 3,
    openingDate: (h.openingDate ?? defaultOpeningDate()).replace(/T.*$/, ''),
    nearbyAttractions: h.nearbyAttractions ?? [],
    images: h.images ?? [],
    facilities: h.facilities ?? [],
    tags: h.tags ?? [],
  };
}

export default function HotelEdit({ id }: { id?: string }) {
  const location = useLocation();
  const isEdit = id !== 'new';

  const [form, setForm] = useState(emptyForm);
  const [roomTypes, setRoomTypes] = useState<RoomTypeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(!!(isEdit && id));
  const [roomTypeAdding, setRoomTypeAdding] = useState(false);
  const [roomTypeEditId, setRoomTypeEditId] = useState<number | null>(null);
  const [roomTypeForm, setRoomTypeForm] = useState({ name: '', price: '', stock: '', capacity: '', description: '' });

  const loadHotel = (): Promise<void> => {
    if (!id || !isEdit) return Promise.resolve();
    return getHotel(id).then((h) => {
      setForm(backendToForm(h));
      setRoomTypes((h.roomTypes ?? []).map((r) => ({ id: r.id, name: r.name, price: r.price, stock: r.stock, capacity: r.capacity ?? null, description: r.description ?? null })));
    });
  };

  useEffect(() => {
    if (!isEdit || !id) return;
    setFetching(true);
    loadHotel()
      .catch(() => showToast('加载酒店失败'))
      .finally(() => setFetching(false));
  }, [id, isEdit]);

  const handleSave = async () => {
    const nameZh = form.nameZh.trim();
    const address = form.address.trim();
    const openingDate = form.openingDate.replace(/T.*$/, '');

    if (!nameZh) return showToast('请填写酒店名称');
    if (!address) return showToast('请填写详细地址');
    if (!openingDate) return showToast('请选择开业日期');

    const starRating = Math.min(5, Math.max(1, form.starRating));
    const facilities = form.facilities.length ? form.facilities : [];
    const tags = form.tags.length ? form.tags : [];
    const nearbyAttractions = form.nearbyAttractions.length ? form.nearbyAttractions : null;
    const images = form.images.length ? form.images : null;
    const nameEn = form.nameEn.trim() || null;

    const ownerIdNum = currentUser.value?.id ? Number(currentUser.value.id) : NaN;
    const ownerId = Number.isInteger(ownerIdNum) && ownerIdNum >= 1 ? ownerIdNum : undefined;

    const body: HotelCreateBody = {
      nameZh,
      nameEn,
      address,
      latitude: null,
      longitude: null,
      starRating,
      openingDate,
      nearbyAttractions,
      images,
      facilities,
      tags,
    };
    if (ownerId != null) body.ownerId = ownerId;

    setLoading(true);
    try {
      if (isEdit && id) {
        const { ownerId: _o, ...updateBody } = body;
        await updateHotel(id, {
          ...updateBody,
          status: FRONTEND_STATUS_MAP['审核中'],
        });
      } else {
        await createHotel(body);
      }
      location.route('/merchant');
    } catch (e) {
      showToast(e instanceof Error ? e.message : '保存失败');
    } finally {
      setLoading(false);
    }
  };

  const setList = (key: 'nearbyAttractions' | 'images' | 'facilities' | 'tags', value: string) => {
    setForm((f) => ({ ...f, [key]: parseList(value) }));
  };
  const getListStr = (key: 'nearbyAttractions' | 'images' | 'facilities' | 'tags') => form[key].join(', ');

  const saveNewRoomType = async () => {
    const name = roomTypeForm.name.trim();
    const price = Number(roomTypeForm.price);
    const stock = Math.max(0, Math.floor(Number(roomTypeForm.stock)));
    if (!name) return showToast('请填写房型名称');
    if (!Number.isFinite(price) || price < 0) return showToast('请填写有效价格');
    if (!id || id === 'new') return showToast('请先保存酒店');
    try {
      await createRoomType({
        hotelId: Number(id),
        name,
        price,
        stock,
        capacity: roomTypeForm.capacity.trim() ? Math.max(1, Math.floor(Number(roomTypeForm.capacity))) : null,
        description: roomTypeForm.description.trim() || null,
      });
      setRoomTypeForm({ name: '', price: '', stock: '', capacity: '', description: '' });
      setRoomTypeAdding(false);
      await loadHotel();
      showToast('房型已添加');
    } catch (e) {
      showToast(e instanceof Error ? e.message : '添加失败');
    }
  };

  const saveEditRoomType = async (roomId: number) => {
    const name = roomTypeForm.name.trim();
    const price = Number(roomTypeForm.price);
    const stock = Math.max(0, Math.floor(Number(roomTypeForm.stock)));
    if (!name) return showToast('请填写房型名称');
    if (!Number.isFinite(price) || price < 0) return showToast('请填写有效价格');
    try {
      await updateRoomType(roomId, {
        name,
        price,
        stock,
        capacity: roomTypeForm.capacity.trim() ? Math.max(1, Math.floor(Number(roomTypeForm.capacity))) : null,
        description: roomTypeForm.description.trim() || null,
      });
      setRoomTypeEditId(null);
      setRoomTypeForm({ name: '', price: '', stock: '', capacity: '', description: '' });
      await loadHotel();
      showToast('房型已更新');
    } catch (e) {
      showToast(e instanceof Error ? e.message : '更新失败');
    }
  };

  const doDeleteRoomType = (roomId: number) => {
    showConfirm('确定删除该房型？', async () => {
      try {
        await deleteRoomType(roomId);
        await loadHotel();
        showToast('已删除');
      } catch (e) {
        showToast(e instanceof Error ? e.message : '删除失败');
      }
    });
  };

  const startEditRoomType = (r: RoomTypeRow) => {
    setRoomTypeEditId(r.id);
    setRoomTypeForm({
      name: r.name,
      price: String(r.price),
      stock: String(r.stock),
      capacity: r.capacity != null ? String(r.capacity) : '',
      description: r.description ?? '',
    });
  };

  if (fetching) {
    return (
      <div className="hotel-edit-page">
        <div className="hotel-edit-card">
          <p className="hotel-edit-loading">加载中…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="hotel-edit-page">
      <div className="hotel-edit-card">
        <h2 className="hotel-edit-title">{isEdit ? '编辑酒店信息' : '新酒店入驻'}</h2>

        <section className="hotel-edit-section">
          <h3 className="hotel-edit-section-title">基本信息</h3>
          <div className="hotel-edit-grid">
            <div className="hotel-edit-field hotel-edit-field-full">
              <label>酒店名称（中文）<span className="hotel-edit-required">*</span></label>
              <input
                className="hotel-edit-input"
                value={form.nameZh}
                onInput={(e) => setForm((f) => ({ ...f, nameZh: e.currentTarget.value }))}
                placeholder="如：XX 酒店"
              />
            </div>
            <div className="hotel-edit-field hotel-edit-field-full">
              <label>酒店名称（英文，选填）</label>
              <input
                className="hotel-edit-input"
                value={form.nameEn}
                onInput={(e) => setForm((f) => ({ ...f, nameEn: e.currentTarget.value }))}
                placeholder="如：XX Hotel"
              />
            </div>
            <div className="hotel-edit-field hotel-edit-field-full">
              <label>详细地址<span className="hotel-edit-required">*</span></label>
              <textarea
                className="hotel-edit-input"
                value={form.address}
                onInput={(e) => setForm((f) => ({ ...f, address: e.currentTarget.value }))}
                rows={2}
                placeholder="省市区、街道、门牌号"
              />
            </div>
            <div className="hotel-edit-field">
              <label>开业日期<span className="hotel-edit-required">*</span></label>
              <input
                type="date"
                className="hotel-edit-input"
                value={form.openingDate}
                onInput={(e) => setForm((f) => ({ ...f, openingDate: e.currentTarget.value }))}
              />
            </div>
            <div className="hotel-edit-field">
              <label>星级（1～5）</label>
              <select
                className="hotel-edit-input"
                value={form.starRating}
                onChange={(e) => setForm((f) => ({ ...f, starRating: Number(e.currentTarget.value) }))}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>{n} 星</option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {isEdit && id && (
          <section className="hotel-edit-section">
            <h3 className="hotel-edit-section-title">房型与价格</h3>
            <p className="hotel-edit-room-desc">添加房型后，列表卡片将显示最低价。房型需在保存酒店后在此页维护。</p>
            <div className="hotel-edit-room-list">
              {roomTypes.map((r) => (
                <div key={r.id} className="hotel-edit-room-row">
                  {roomTypeEditId === r.id ? (
                    <>
                      <div className="hotel-edit-room-fields">
                        <input
                          className="hotel-edit-input hotel-edit-room-name"
                          value={roomTypeForm.name}
                          onInput={(e) => setRoomTypeForm((f) => ({ ...f, name: e.currentTarget.value }))}
                          placeholder="房型名称"
                        />
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          className="hotel-edit-input hotel-edit-room-price"
                          value={roomTypeForm.price}
                          onInput={(e) => setRoomTypeForm((f) => ({ ...f, price: e.currentTarget.value }))}
                          placeholder="价格"
                        />
                        <input
                          type="number"
                          min={0}
                          className="hotel-edit-input hotel-edit-room-stock"
                          value={roomTypeForm.stock}
                          onInput={(e) => setRoomTypeForm((f) => ({ ...f, stock: e.currentTarget.value }))}
                          placeholder="库存"
                        />
                      </div>
                      <div className="hotel-edit-room-actions">
                        <button type="button" className="hotel-edit-room-btn-save" onClick={() => saveEditRoomType(r.id)}>保存</button>
                        <button type="button" className="hotel-edit-room-btn-cancel" onClick={() => { setRoomTypeEditId(null); setRoomTypeForm({ name: '', price: '', stock: '', capacity: '', description: '' }); }}>取消</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="hotel-edit-room-info">
                        <span className="hotel-edit-room-name-txt">{r.name}</span>
                        <span className="hotel-edit-room-price-txt">¥{r.price}</span>
                        <span className="hotel-edit-room-stock-txt">库存 {r.stock}</span>
                      </div>
                      <div className="hotel-edit-room-actions">
                        <button type="button" className="hotel-edit-room-btn-edit" onClick={() => startEditRoomType(r)}>编辑</button>
                        <button type="button" className="hotel-edit-room-btn-delete" onClick={() => doDeleteRoomType(r.id)}>删除</button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
            {roomTypeAdding ? (
              <div className="hotel-edit-room-row hotel-edit-room-add-form">
                <div className="hotel-edit-room-fields">
                  <input
                    className="hotel-edit-input hotel-edit-room-name"
                    value={roomTypeForm.name}
                    onInput={(e) => setRoomTypeForm((f) => ({ ...f, name: e.currentTarget.value }))}
                    placeholder="房型名称"
                  />
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    className="hotel-edit-input hotel-edit-room-price"
                    value={roomTypeForm.price}
                    onInput={(e) => setRoomTypeForm((f) => ({ ...f, price: e.currentTarget.value }))}
                    placeholder="价格"
                  />
                  <input
                    type="number"
                    min={0}
                    className="hotel-edit-input hotel-edit-room-stock"
                    value={roomTypeForm.stock}
                    onInput={(e) => setRoomTypeForm((f) => ({ ...f, stock: e.currentTarget.value }))}
                    placeholder="库存"
                  />
                </div>
                <div className="hotel-edit-room-actions">
                  <button type="button" className="hotel-edit-room-btn-save" onClick={saveNewRoomType}>保存</button>
                  <button type="button" className="hotel-edit-room-btn-cancel" onClick={() => { setRoomTypeAdding(false); setRoomTypeForm({ name: '', price: '', stock: '', capacity: '', description: '' }); }}>取消</button>
                </div>
              </div>
            ) : (
              <button type="button" className="hotel-edit-room-add-btn" onClick={() => setRoomTypeAdding(true)}>+ 添加房型</button>
            )}
          </section>
        )}

        <section className="hotel-edit-section">
          <h3 className="hotel-edit-section-title">设施与标签</h3>
          <div className="hotel-edit-grid">
            <div className="hotel-edit-field hotel-edit-field-full">
              <label>设施（逗号分隔，每项 1～50 字）</label>
              <input
                className="hotel-edit-input"
                value={getListStr('facilities')}
                onInput={(e) => setList('facilities', e.currentTarget.value)}
                placeholder="如：含早, 健身房, 免费停车"
              />
            </div>
            <div className="hotel-edit-field hotel-edit-field-full">
              <label>附近景点（逗号分隔）</label>
              <input
                className="hotel-edit-input"
                value={getListStr('nearbyAttractions')}
                onInput={(e) => setList('nearbyAttractions', e.currentTarget.value)}
                placeholder="如：外滩, 南京路"
              />
            </div>
            <div className="hotel-edit-field hotel-edit-field-full">
              <label>标签（逗号分隔）</label>
              <input
                className="hotel-edit-input"
                value={getListStr('tags')}
                onInput={(e) => setList('tags', e.currentTarget.value)}
                placeholder="如：商务, 亲子"
              />
            </div>
          </div>
        </section>

        <section className="hotel-edit-section">
          <h3 className="hotel-edit-section-title">图片（选填）</h3>
          <div className="hotel-edit-field hotel-edit-field-full">
            <label>图片 URL，每行或逗号分隔</label>
            <textarea
              className="hotel-edit-input"
              value={form.images.join('\n')}
              onInput={(e) => setForm((f) => ({ ...f, images: parseList(e.currentTarget.value.replace(/\n/g, ',')) }))}
              rows={3}
              placeholder="https://example.com/1.jpg"
            />
          </div>
        </section>

        <div className="hotel-edit-actions">
          <button type="button" onClick={handleSave} className="hotel-edit-submit" disabled={loading}>
            {loading ? '提交中…' : '提交审核并保存'}
          </button>
          <button type="button" onClick={() => location.route('/merchant')} className="hotel-edit-cancel" disabled={loading}>
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
