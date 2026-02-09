import { useState } from 'preact/hooks';
import { hotels, currentUser, type Hotel } from '../store';

export default function HotelEdit({ id }: { id?: string }) {
  const isEdit = id !== 'new';
  const existingHotel = hotels.value.find(h => h.id === id);

  const [form, setForm] = useState<Partial<Hotel>>(existingHotel || {
    name: '', address: '', price: 300, tags: [], status: '审核中'
  });

  const handleSave = () => {
    if (isEdit) {
      hotels.value = hotels.value.map(h => h.id === id ? { ...h, ...form, status: '审核中' } as Hotel : h);
    } else {
      const newHotel: Hotel = { 
        ...form as Hotel, 
        id: 'h_' + Date.now(), 
        merchantId: currentUser.value?.id || '', 
        status: '审核中' 
      };
      hotels.value = [...hotels.value, newHotel];
    }
    window.location.href = '/merchant';
  };

  return (
    <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-sm border p-8">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">{isEdit ? '编辑酒店信息' : '新酒店入驻'}</h2>
      <div className="grid grid-cols-2 gap-6">
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1 font-bold">酒店名称</label>
          <input value={form.name} onInput={e => setForm({...form, name: e.currentTarget.value})} className="w-full p-2.5 border rounded-lg" />
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1 font-bold">详细地址</label>
          <textarea value={form.address} onInput={e => setForm({...form, address: e.currentTarget.value})} className="w-full p-2.5 border rounded-lg" rows={3} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1 font-bold">价格 (元)</label>
          <input type="number" value={form.price} onInput={e => setForm({...form, price: Number(e.currentTarget.value)})} className="w-full p-2.5 border rounded-lg" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1 font-bold">体验标签 (逗号隔开)</label>
          <input value={form.tags?.join(',')} onInput={e => setForm({...form, tags: e.currentTarget.value.split(',')})} className="w-full p-2.5 border rounded-lg" placeholder="如：含早, 健身房" />
        </div>
      </div>
      <div className="mt-8 flex gap-4">
        <button onClick={handleSave} className="px-6 py-2.5 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700">提交审核并保存</button>
        <button onClick={() => window.location.href = '/merchant'} className="px-6 py-2.5 bg-gray-100 text-gray-600 rounded-lg">取消</button>
      </div>
    </div>
  );
}
