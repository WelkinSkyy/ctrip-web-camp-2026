import { hotels } from '../store';

export default function AuditList() {
  const handleStatusChange = (id: string, nextStatus: any, reason?: string) => {
    hotels.value = hotels.value.map(h => 
      h.id === id ? { ...h, status: nextStatus, rejectReason: reason || '' } : h
    );
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
      <div className="p-6 border-b bg-gray-50"><h2 className="text-xl font-bold text-gray-800">酒店发布管理中心</h2></div>
      <table className="w-full text-left">
        <thead className="bg-gray-100 text-gray-500 uppercase text-xs font-bold">
          <tr>
            <th className="px-6 py-4 border-b">酒店名</th>
            <th className="px-6 py-4 border-b">标签</th>
            <th className="px-6 py-4 border-b">状态</th>
            <th className="px-6 py-4 border-b text-right">管理操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {hotels.value.map(h => (
            <tr key={h.id} className="hover:bg-blue-50/20 transition">
              <td className="px-6 py-4 font-bold">{h.name}<p className="text-xs text-gray-400 font-normal">{h.address}</p></td>
              <td className="px-6 py-4">
                <div className="flex gap-1">
                  {h.tags.map(t => <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded text-xs">{t}</span>)}
                </div>
              </td>
              <td className="px-6 py-4">
                <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                  h.status === '通过' ? 'bg-green-100 text-green-700' :
                  h.status === '审核中' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                }`}>
                  {h.status}
                </span>
              </td>
              <td className="px-6 py-4 text-right">
                {h.status === '审核中' ? (
                  <div className="flex gap-4 justify-end">
                    <button onClick={() => handleStatusChange(h.id, '通过')} className="text-blue-600 font-bold">批准</button>
                    <button onClick={() => {
                        const r = prompt('理由:'); 
                        if(r) handleStatusChange(h.id, '不通过', r);
                    }} className="text-red-500 font-bold">驳回</button>
                  </div>
                ) : (
                    <button onClick={() => handleStatusChange(h.id, h.status === '已下线' ? '通过' : '已下线')} 
                            className={`font-bold ${h.status === '已下线' ? 'text-green-600' : 'text-gray-400'}`}>
                      {h.status === '已下线' ? '恢复上线' : '一键下线'}
                    </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
