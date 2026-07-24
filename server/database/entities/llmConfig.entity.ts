import { Column, Entity, PrimaryColumn } from 'typeorm'

/** 用户自带模型（BYOK）配置，每用户一行；apiKey 加密落库（见 server/utils/crypto.ts）。 */
@Entity({ name: 'user_llm_configs' })
export class LlmConfig {
  @PrimaryColumn({ name: 'user_id', type: 'integer', primaryKeyConstraintName: 'pk_user_llm_configs' })
  userId!: number

  /** 上游协议：openai-chat / openai-responses / anthropic */
  @Column({ type: 'text', nullable: false })
  provider!: string

  @Column({ name: 'base_url', type: 'text', nullable: false })
  baseUrl!: string

  /** AES-256-GCM 加密后的 API key，格式 `iv:tag:ciphertext` */
  @Column({ name: 'api_key_encrypted', type: 'text', nullable: false })
  apiKeyEncrypted!: string

  @Column({ type: 'text', nullable: false })
  model!: string

  /** 思考深度：'' = 默认（不发送思考参数），否则 low / medium / high */
  @Column({ type: 'text', nullable: false, default: '' })
  thinking!: string

  @Column({
    name: 'updated_at',
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
  })
  updatedAt!: Date
}
