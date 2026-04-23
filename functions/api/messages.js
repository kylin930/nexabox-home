export async function onRequestGet(context) {
    try {
        // 从 KV 读取留言列表
        const data = await context.env.KV_BOARD.get("messages_list", "json");
        return Response.json(data || []);
    } catch (e) {
        return new Response(e.message, { status: 500 });
    }
}

export async function onRequestPost(context) {
    try {
        const data = await context.request.json();
        
        // 1. 基础校验
        if (!data.nickname || !data.content) {
            return new Response("昵称和内容不能为空", { status: 400 });
        }

        // 2. 频率限制 (基于真实访问者 IP)
        const clientIP = context.request.headers.get('CF-Connecting-IP') || 'unknown';
        const rateLimitKey = `rl_${clientIP}`;
        
        // 检查是否还在冷却期中
        const isLimited = await context.env.KV_BOARD.get(rateLimitKey);
        if (isLimited) {
            return new Response("发送太频繁啦，请休息一分钟后再试", { status: 429 });
        }

        // 3. 构建新留言对象
        const newMessage = {
            nickname: data.nickname,
            qq: data.qq || '', // 可选的 QQ 号
            content: data.content,
            created_at: new Date().toISOString()
        };

        // 4. 获取现有列表并更新
        let currentMessages = await context.env.KV_BOARD.get("messages_list", "json") || [];
        
        // 将新留言插入到最前面，并限制总数为 50 条
        currentMessages.unshift(newMessage);
        currentMessages = currentMessages.slice(0, 50);

        // 5. 将更新后的列表存回 KV
        await context.env.KV_BOARD.put("messages_list", JSON.stringify(currentMessages));

        // 6. 写入该 IP 的频率限制标记，设置 TTL 为 60 秒 (60秒后自动删除)
        await context.env.KV_BOARD.put(rateLimitKey, "limited", { expirationTtl: 60 });

        return Response.json({ success: true });
    } catch (e) {
        return new Response(e.message, { status: 500 });
    }
}
