import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm'

@Entity({ name: 'effect_versions' })
@Index('idx_effect_versions_effect', ['effectId'])
@Index('uq_effect_versions_effect_version', ['effectId', 'version'], {
  unique: true,
})
export class EffectVersion {
  @PrimaryGeneratedColumn('increment', {
    type: 'integer',
    primaryKeyConstraintName: 'pk_effect_versions',
  })
  id!: number

  @Column({ name: 'effect_id', type: 'integer', nullable: false })
  effectId!: number

  @Column({ type: 'text', nullable: false })
  version!: string // 语义化版本号，同一 effect 下唯一

  @Column({ name: 'sha256', type: 'text', nullable: false })
  sha256!: string

  @Column({ type: 'text', nullable: false })
  entry!: string // 入口模块，如 main.mjs

  @Column({ name: 'size_bytes', type: 'integer', nullable: false })
  sizeBytes!: number

  @Column({ name: 'sdk_version', type: 'text', nullable: false })
  sdkVersion!: string

  @Column({ name: 'schema_version', type: 'text', nullable: false })
  schemaVersion!: string

  @Column({ name: 'manifest_json', type: 'text', nullable: false })
  manifestJson!: string // 完整 effect.json 快照

  @Column({ name: 'assets_json', type: 'text', nullable: true })
  assetsJson!: string | null // 资源清单 [{path, mime, sha256, sizeBytes, storageKey}]，单文件包为 null

  @Column({ name: 'storage_key', type: 'text', nullable: false })
  storageKey!: string // 指向本地 ArtifactStore / 对象存储中的入口产物

  @Column({ name: 'created_by', type: 'integer', nullable: false })
  createdBy!: number

  @Column({
    name: 'created_at',
    type: 'datetime',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt!: Date
}
