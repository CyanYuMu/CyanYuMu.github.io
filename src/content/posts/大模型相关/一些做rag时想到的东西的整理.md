---
title: 一些做rag时想到的东西的整理
published: 2025-12-02
description: '怎么根据实际的场景去做选择'
image: ''
tags: [大模型]
category: '学习记录'
draft: false
---

## 事情的起因

很多对于RAG的考察都喜欢问Agent的长期记忆如何持久化。向量数据库的选择标准是什么。我在此之前其实并未做过什么细致的考察。也没特意研究过选型。

## 现有认知

Agent的长期记忆持久化主要通过向量数据库存储embedding实现，具体流程是对话历史，用户偏好只是片段经过embedding转换为向量，存入向量数据库，后续通过语义检索召回相关记忆。这个过程的核心在于解决一个关键问题：当用户有成千上万条历史记录时，怎么快速找到语义相关的那几条？传统数据库擅长精确匹配，但 Agent 需要语义理解。大部分人在和AI对话其实没有特别注重如何投放提示词，而是很随意的提问，比如用户问 “上次那个便宜的推荐”，系统要能关联到历史对话里的价格敏感信息，这就需要向量相似度检索而不是 SQL 的模糊查询。
选择向量数据库时需要关注几个核心维度。性能层面看查询延迟和吞吐量，生产环境通常要求毫秒级响应，像Milvus在百万级数据下能保持较好性能。索引算法很关键，HNSW 适合高稠密向量的快速检索，IVF 系列适合大规模场景。（具体的算法细节想了解可以去wiki百科查一下）。过滤能力决定能否结合元数据筛选，比如按时间范围或用户 ID 过滤记忆，这在多租户场景必不可少。还要考虑混合检索支持，很多场景需要向量检索和关键词检索结合，像 Weaviate 原生支持这种能力。数据规模也影响选型，小规模可用 Chroma 这类嵌入式方案，企业级应用更适合自建 Milvus 集群这些。
至于生态适配。langchain框架是由非常成熟的集成，而我最近在关注的eino里面也支持了一整套如embeding,retreiver组件。挺好的

## 然后

我们要更加系统的分析记忆分层架构与持久化链路的话。首先需要知道：要分层管理不同时效的信息。短期记忆就是当前对话的上下文，通常存在内存或 Redis 里，会话结束就清理掉，这部分主要服务于单次对话的连贯性。长期记忆是需要跨会话保留的信息，比如用户的消费偏好、历史咨询问题、积累的知识片段，这部分才需要持久化到向量数据库。有些复杂场景还会有情景记忆，记录特定任务的执行过程，方便后续复盘或继续执行未完成的任务。使用向量数据库是因为传统 SQL 根本匹配不上文字不同语义相近的两句话，但它们语义是相关的。向量化就是把文本映射到高维空间，语义相近的句子在空间中距离更近，这样就能通过计算向量相似度（通常用余弦距离或欧氏距离）找到相关记忆。具体实现上，会通过 OpenAI 的 text-embedding 模型或者开源的 BERT 模型把文本转成 768 维或 1536 维的浮点数向量。

#### 把他总结一下就是

本预处理，可能需要去除无意义的语气词、标准化格式，这步看似简单但影响后续检索质量。然后调用Embedding 模型转换成向量，这一步要注意选择合适的模型，电商客服场景可能需要对领域术语敏感的模型，通用对话可能直接用 OpenAI 的接口就够了。接下来是向量入库，这里不只是存向量本身，还要把元数据一起存储。
```go
// MemoryPersistenceService 记忆持久化服务
type MemoryPersistenceService struct {
	embeddingClient EmbeddingClient
	vectorStore     VectorStore
}
//NweMemoryPersistenceService 创建服务实例
func NewMemoryPersistenceService(embeddingClient EmbeddingClient, vectorStore VectorStore) *MemoryPersistenceService {
	return &MemoryPersistenceService{
		embeddingClient: embeddingClient,
		vectorStore:     vectorStore,
	}
}
// SaveMemory 保存记忆到向量数据库
func (s *MemoryPersistenceService) SaveMemory(ctx context.Context, userId, conversation string) error {
	// 生成向量表示
	embedding, err := s.embeddingClient.Embed(ctx, conversation)
	if err != nil {
		return err
	}

	// 构造元数据
	metadata := map[string]interface{}{
		"user_id":    userId,
		"timestamp":  time.Now().UnixMilli(),
		"content":    conversation,
		"session_id": getCurrentSessionId(),
	}

	// 存入向量数据库
	return s.vectorStore.Insert(ctx, embedding, metadata)
}

// 依赖的接口定义
type EmbeddingClient interface {
	Embed(ctx context.Context, text string) ([]float32, error)
}

type VectorStore interface {
	Insert(ctx context.Context, embedding []float32, metadata map[string]interface{}) error
}

// getCurrentSessionId 获取当前会话ID（示例实现，实际根据业务逻辑）
func getCurrentSessionId() string {
	// 这里替换为实际的会话ID获取逻辑
	return "session_123"
}
```
这里的元数据界定了后续作甚么样的过滤和排序，检索是流程反过来，把查询到的文本想来概念化，然后再向量数据库做相似度检索。
生产环境还要考虑缓存热点记忆、异步写入、失败重试这些工程问题。理论和实践之间有很大的差距，比如异步写入虽然能提升吞吐量，但要处理好主库写入成功但向量库写入失败的一致性问题。
向量数据库和传统数据库的本质差异在于索引结构的设计目标完全不同。传统数据库的 B + 树索引是为范围查询优化的，比如查年龄在 20 到 30 之间的用户，时间复杂度是 O (log n)。但向量检索要的是 “找最相似的 K 个向量”，这是完全不同的计算模式。如果用 MySQL 暴力计算余弦相似度，百万级数据每次查询要做上百万次浮点运算，延迟会达到秒级甚至更高。
向量数据库专门为高维向量的相似度计算设计了索引结构。比如HNSW 算构建的图索引，把向量空间组织成多层图结构，检索时从顶层快速定位区域，再逐层下钻找到最近邻，时间复杂度是对数级别的。另一种常见的是IVF 索引，先用聚类算法把向量空间划分成若干个区域，检索时只在最相关的几个区域里搜索，大幅减少计算量。

## 混合检索

刚刚也提到了元数据，那为什么要用到元数据和这里所提到的混合检索有关，很多业务股则要和向量检索结合。实现思路是先用向量粗排序召回更多候选，再通过元数据过滤重排序得到最终结果。
```go
package service

import (
	"context"
	"sort"
	"time"
)

// HybridSearchService 混合检索服务
type HybridSearchService struct {
	vectorDB VectorDatabase
}

// NewHybridSearchService 创建服务实例
func NewHybridSearchService(vectorDB VectorDatabase) *HybridSearchService {
	return &HybridSearchService{vectorDB: vectorDB}
}

// SearchMemories 执行混合检索
func (s *HybridSearchService) SearchMemories(ctx context.Context, req *SearchRequest) ([]*Memory, error) {
	// 第一步：向量粗排，召回3倍候选
	candidates, err := s.vectorDB.SimilaritySearch(ctx, req.QueryEmbedding, req.TopK*3)
	if err != nil {
		return nil, err
	}

	// 第二步：元数据过滤
	filtered := make([]*VectorMatch, 0, len(candidates))
	for _, m := range candidates {
		if isWithinTimeRange(m, req.TimeRange) && matchesUserSegment(m, req.UserID) {
			filtered = append(filtered, m)
		}
	}

	// 第三步：混合打分重排
	scoredMemories := make([]*ScoredMemory, 0, len(filtered))
	for _, m := range filtered {
		score := s.calculateHybridScore(m, req)
		scoredMemories = append(scoredMemories, &ScoredMemory{
			Memory: m.Memory,
			Score:  score,
		})
	}

	// 按分数降序排序
	sort.Slice(scoredMemories, func(i, j int) bool {
		return scoredMemories[i].Score > scoredMemories[j].Score
	})

	// 取TopK结果
	resultCount := req.TopK
	if len(scoredMemories) < resultCount {
		resultCount = len(scoredMemories)
	}
	results := make([]*Memory, 0, resultCount)
	for i := 0; i < resultCount; i++ {
		results = append(results, scoredMemories[i].Memory)
	}

	return results, nil
}

// calculateHybridScore 计算混合检索得分
func (s *HybridSearchService) calculateHybridScore(match *VectorMatch, req *SearchRequest) float64 {
	vectorScore := match.Similarity
	recencyScore := s.calculateRecency(match.Timestamp)
	importanceScore, ok := match.Metadata["importance"].(float64)
	if !ok {
		importanceScore = 0.5
	}

	// 权重可根据业务调整
	return 0.6*vectorScore + 0.3*recencyScore + 0.1*importanceScore
}

// calculateRecency 计算时间衰减得分
func (s *HybridSearchService) calculateRecency(timestamp int64) float64 {
	ageInDays := (time.Now().UnixMilli() - timestamp) / (1000 * 60 * 60 * 24)
	return float64(math.Exp(-float64(ageInDays) / 30.0)) // 30天衰减模型
}

// ---------------- 依赖的类型定义 ----------------
type SearchRequest struct {
	QueryEmbedding []float32
	TopK           int
	TimeRange      [2]int64 // [start, end] 时间戳范围
	UserID         string
}

type VectorMatch struct {
	Memory     *Memory
	Similarity float64
	Timestamp  int64
	Metadata   map[string]interface{}
}

type ScoredMemory struct {
	Memory *Memory
	Score  float64
}

type Memory struct {
	// 根据实际业务定义Memory的字段
}

type VectorDatabase interface {
	SimilaritySearch(ctx context.Context, embedding []float32, topK int) ([]*VectorMatch, error)
}

// 辅助过滤函数（示例实现）
func isWithinTimeRange(m *VectorMatch, timeRange [2]int64) bool {
	return m.Timestamp >= timeRange[0] && m.Timestamp <= timeRange[1]
}

func matchesUserSegment(m *VectorMatch, userID string) bool {
	// 实际业务逻辑：匹配用户分群
	return true
}
```

## 缓存策略

在某些业务场景中油热点查询，这个时候在应用层加一层LRU缓存，把最近检索过的query和对应记忆ID缓存下来。
和业务里的redis做缓存防止击穿是一个道理。

**以上这些可以总结为：怎么提高召回率，怎么根据具体的情况对数据库进行选型等。**

## 谈谈多模态

多模态在Rag领域里也火了起来。问题在于怎么自己做跨模态对齐，是个值得关注的前沿方向。现在很多 Agent 不只处理文本，还要记忆图片、语音这些多模态信息，这时候需要把不同模态的数据映射到同一个向量空间，用 CLIP 这类跨模态模型做 embedding。实际落地时要考虑不同模态的权重，比如电商客服记住用户发的产品图片比记住语气词更重要，检索时可以给图片向量更高的权重。具体实现上可以分别存储文本向量和图像向量，检索时做两次查询再合并结果，也可以用跨模态模型直接生成统一的向量表示。
从 Agent 记忆往外延伸还能关联到 RAG 的架构设计。Agent 的记忆系统本质上是 RAG 的一个应用场景，都是通过检索来增强生成的准确性。但两者也有差异，RAG 通常是检索固定的知识库，而 Agent 记忆是检索不断增长的交互历史。如果要做更复杂的推理，可以把知识图谱和向量检索结合，先用向量找到相关实体，再通过图谱关系扩展出更多上下文。比如用户问 “那个推荐过红色款的客服是谁”，先通过向量找到 “红色款推荐” 相关的记忆，再通过图谱关系找到对应的客服人员节点。
未来向量数据库会朝着几个方向发展。原生多模态支持会成为标配，不需要自己做跨模态对齐。更智能的索引自动调优，系统能根据查询模式自动选择最优索引策略，而不是靠 DBA 手动配置参数。和大模型的深度整合也是趋势，比如直接在向量数据库里做 Embedding，减少网络传输开销，甚至可能出现向量数据库和推理引擎一体化的产品。这些演进方向都在解决同一个核心问题：让 AI 应用的记忆系统更高效、更智能、更易用。